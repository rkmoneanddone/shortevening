'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
initializeApp();
const openAIKey = defineSecret('OPENAI_API_KEY');

/** Validate ingredients supplied by the signed-in client. */
function parseIngredients(data) {
  const items = data?.ingredients;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20 ||
      !items.every(x => typeof x === 'string' && x.trim().length > 0 && x.length <= 60)) {
    throw new HttpsError('invalid-argument', 'Enter 1 to 20 valid ingredients.');
  }
  return [...new Set(items.map(x => x.trim().toLowerCase()))];
}

/** Fetch server-owned dietary preferences from the user's profile. */
async function readPreferences(uid) {
  const snapshot = await getFirestore().doc('users/' + uid).get();
  if (!snapshot.exists || !snapshot.get('onboardingCompleted')) {
    throw new HttpsError('failed-precondition', 'Complete your profile first.');
  }
  return {
    diet: snapshot.get('diet'),
    allergies: snapshot.get('allergies') || [],
    minutes: snapshot.get('preferredMinutes') || 20
  };
}

/** A single server-owned access policy, reusable by web and future mobile clients. */
async function resolveAccess(uid) {
  const [user, entitlement] = await Promise.all([
    getAuth().getUser(uid),
    getFirestore().doc('users/' + uid + '/entitlements/ai').get()
  ]);
  const data = entitlement.exists ? entitlement.data() : null;
  const paid = data?.status === 'active' && data?.plan === 'paid'
    && (!data.expiresAt || (typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() > Date.now()));
  const created = Date.parse(user.metadata.creationTime);
  const trialEndsAt = Number.isFinite(created) ? new Date(created + 30 * 86400000).toISOString() : null;
  const trial = !paid && Number.isFinite(created) && Date.now() < created + 30 * 86400000;
  const tier = paid ? 'paid' : trial ? 'trial' : 'free';
  return { tier, aiDailyLimit: tier === 'free' ? 2 : 5,
    historyDays: tier === 'free' ? 1 : 14, favoritesEnabled: tier !== 'free',
    rotatingDailyPicks: tier !== 'free', trialEndsAt };
}

/** Client-readable access status; payment webhook will eventually manage entitlements. */
exports.getAccessStatus = onCall({ region: 'asia-south1', enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return resolveAccess(request.auth.uid);
});

/** Quota reservation is released on upstream failures. */
async function reserveQuota(uid, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getFirestore().doc('users/' + uid + '/aiUsage/' + day);
  await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.get('count') || 0 : 0;
    if (count >= limit) throw new HttpsError('resource-exhausted', 'Daily AI limit reached (' + limit + ' requests). Resets at 00:00 UTC.');
    tx.set(ref, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return ref;
}
async function releaseQuota(ref) {
  await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.get('count') || 0) > 0) tx.update(ref, { count: FieldValue.increment(-1) });
  });
}
function cacheKey(ingredients, preferences) {
  const { createHash } = require('node:crypto');
  return createHash('sha256').update(JSON.stringify({
    ingredients: [...ingredients].sort(), diet: preferences.diet,
    allergies: [...preferences.allergies].sort(), minutes: preferences.minutes
  })).digest('hex');
}
function validateIdeas(recipes, ingredients, preferences) {
  const blocked = new Set((preferences.allergies || []).map(x => String(x).toLowerCase()));
  const forbidden = {
    milk: /\\b(milk|paneer|cheese|butter|curd|yogurt|ghee|cream)\\b/i,
    wheat: /\\b(wheat|atta|maida|bread|roti|semolina|suji|sooji)\\b/i,
    peanuts: /\\b(peanut|groundnut)\\b/i,
    egg: /\\b(egg|anda|omelette)\\b/i,
    soy: /\\b(soy|soya|tofu)\\b/i,
    'tree nuts': /\\b(almond|cashew|walnut|pistachio|hazelnut)\\b/i
  };
  const pantry = new Set(ingredients.map(x => x.toLowerCase()));
  return recipes.filter(recipe => {
    const all = [recipe.name, ...recipe.ingredients].join(' ');
    if ([...blocked].some(a => forbidden[a]?.test(all))) return false;
    if (preferences.diet === 'vegetarian' && /\\b(egg|chicken|fish|meat|prawn|mutton|beef|pork)\\b/i.test(all)) return false;
    if (preferences.diet === 'eggetarian' && /\\b(chicken|fish|meat|prawn|mutton|beef|pork)\\b/i.test(all)) return false;
    if (recipe.minutes > preferences.minutes || recipe.minutes <= 0) return false;
    recipe.missingIngredients = recipe.ingredients.filter(x => !pantry.has(x.toLowerCase()));
    return true;
  });
}

/** Atomic server-controlled favorite operations; payment logic is separate. */
exports.updateFavorite = onCall({ region: 'asia-south1', enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  const access = await resolveAccess(uid);
  if (!access.favoritesEnabled) throw new HttpsError('permission-denied', 'Favorites require an active trial or Premium.');
  const recipeId = request.data?.recipeId;
  const operation = request.data?.operation;
  if (typeof recipeId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(recipeId) ||
      !['add','remove'].includes(operation)) throw new HttpsError('invalid-argument', 'Invalid favorite request.');
  const db = getFirestore(), counterRef = db.doc('users/' + uid + '/system/favoriteCount');
  const favoriteRef = db.doc('users/' + uid + '/favorites/' + recipeId);
  await db.runTransaction(async tx => {
    const [counter, favorite] = await Promise.all([tx.get(counterRef), tx.get(favoriteRef)]);
    // Existing collections may predate the counter. Bootstrap with a bounded query in the transaction.
    let count = counter.exists ? counter.get('count') || 0 : null;
    if (count === null) {
      const existing = await tx.get(db.collection('users/' + uid + '/favorites').limit(11));
      count = existing.size;
    }
    if (operation === 'add' && !favorite.exists) {
      if (count >= 10) throw new HttpsError('resource-exhausted', 'Maximum 10 favorites. Remove one first.');
      tx.create(favoriteRef, { recipeId, createdAt: FieldValue.serverTimestamp() });
      count += 1;
    } else if (operation === 'remove' && favorite.exists) {
      tx.delete(favoriteRef);
      count = Math.max(0, count - 1);
    }
    tx.set(counterRef, { count, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** Invoke OpenAI only from the server and return a short, bounded response. */
async function generateIdeas(key, ingredients, preferences) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_output_tokens: 1100,
        text: { format: { type: 'json_object' } },
        input: [
          { role: 'system', content: 'Return ONLY JSON object with recipes array of 1 to 3 easy Indian evening snacks. Each recipe: name (string), minutes (integer), ingredients (array of ingredient strings), steps (array of short strings), missingIngredients (array of strings not in pantry). Prefer using pantry ingredients. Respect diet and avoid allergens listed. Do not promise allergy safety. Do not include other fields.' },
          { role: 'user', content: JSON.stringify({ ingredients, preferences }) }
        ]
      })
    });
    if (!response.ok) throw new Error('OpenAI request failed: ' + response.status);
    const body = await response.json();
    const raw = (body.output || []).flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text').map(part => part.text).join('');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.recipes)) throw new Error('Invalid recipe payload');
    const recipes = parsed.recipes.slice(0, 3).map(item => ({
      name: String(item.name || '').slice(0, 90),
      minutes: Number(item.minutes) || 20,
      ingredients: Array.isArray(item.ingredients) ? item.ingredients.slice(0, 18).map(x => String(x).slice(0, 100)) : [],
      steps: Array.isArray(item.steps) ? item.steps.slice(0, 10).map(x => String(x).slice(0, 300)) : [],
      missingIngredients: Array.isArray(item.missingIngredients) ? item.missingIngredients.slice(0, 18).map(x => String(x).slice(0, 100)) : []
    })).filter(item => item.name && item.ingredients.length && item.steps.length);
    if (!recipes.length) throw new Error('No usable recipes returned');
    return recipes;
  } finally {
    clearTimeout(timeout);
  }
}

/** Authenticated callable endpoint shared by future web, Android and iOS clients. */
exports.suggestPantrySnacks = onCall({
  region: 'asia-south1', secrets: [openAIKey],
  enforceAppCheck: true, timeoutSeconds: 30, memory: '256MiB'
}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const ingredients = parseIngredients(request.data);
  try {
    const preferences = await readPreferences(request.auth.uid);
    if (!openAIKey.value()) throw new HttpsError('failed-precondition', 'AI is not configured.');
    const { aiDailyLimit: dailyLimit } = await resolveAccess(request.auth.uid);
    const key = cacheKey(ingredients, preferences);
    const cached = await getFirestore().doc('aiRecipeCache/' + key).get();
    if (cached.exists && cached.get('expiresAt')?.toMillis?.() > Date.now()) {
      return { recipes: cached.get('recipes'), cached: true,
        disclaimer: 'Check all ingredients and allergen labels before cooking.' };
    }
    const quotaRef = await reserveQuota(request.auth.uid, dailyLimit);
    const started = Date.now();
    try {
      const generated = await generateIdeas(openAIKey.value(), ingredients, preferences);
      const recipes = validateIdeas(generated, ingredients, preferences);
      if (!recipes.length) throw new Error('No safe matching recipes returned');
      const { Timestamp } = require('firebase-admin/firestore');
      await getFirestore().doc('aiRecipeCache/' + key).set({
        recipes, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600000),
        createdAt: FieldValue.serverTimestamp()
      }).catch(error => console.warn('Cache write failed', error));
      console.info('AI latency ms', Date.now() - started, 'recipes', recipes.length);
      return { recipes, cached: false,
        disclaimer: 'Check all ingredients and allergen labels before cooking.' };
    } catch (error) {
      await releaseQuota(quotaRef).catch(refundError => console.error('Quota refund failed', refundError));
      throw error;
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Pantry AI request failed', error);
    throw new HttpsError('unavailable', 'AI is temporarily unavailable. Use the standard recipe finder.');
  }
});
