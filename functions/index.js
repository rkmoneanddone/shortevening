'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
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

/** Server-owned paid entitlement; never trust client-submitted plan values. */
async function readDailyLimit(uid) {
  const snapshot = await getFirestore().doc('users/' + uid + '/entitlements/ai').get();
  const data = snapshot.exists ? snapshot.data() : null;
  const paid = data?.status === 'active' && data?.plan === 'paid'
    && (!data.expiresAt || (typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() > Date.now()));
  return paid ? 20 : 5;
}

/** Atomically enforce the user's daily AI allowance (UTC day). */
async function takeQuota(uid, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getFirestore().doc('users/' + uid + '/aiUsage/' + day);
  await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? snapshot.get('count') || 0 : 0;
    if (count >= limit) throw new HttpsError('resource-exhausted', 'Daily AI limit reached (' + limit + ' requests). Resets at 00:00 UTC.');
    transaction.set(ref, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

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
    const dailyLimit = await readDailyLimit(request.auth.uid);
    await takeQuota(request.auth.uid, dailyLimit);
    const recipes = await generateIdeas(openAIKey.value(), ingredients, preferences);
    return {
      recipes,
      disclaimer: 'AI suggestions may be inaccurate. Verify every ingredient and allergen label.'
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Pantry AI request failed', error);
    throw new HttpsError('unavailable', 'AI is temporarily unavailable. Use the standard recipe finder.');
  }
});
