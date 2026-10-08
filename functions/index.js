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

/** Atomically limit AI usage to five requests per UTC day per account. */
async function takeQuota(uid) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getFirestore().doc('users/' + uid + '/aiUsage/' + day);
  await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? snapshot.get('count') || 0 : 0;
    if (count >= 5) throw new HttpsError('resource-exhausted', 'Daily AI limit reached.');
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
        max_output_tokens: 700,
        input: [
          { role: 'system', content: 'Suggest at most three easy Indian evening snacks using available ingredients. Respect stated diet and avoid listed allergens. Include missing ingredients and brief preparation steps. Never promise allergen safety. Return plain text.' },
          { role: 'user', content: JSON.stringify({ ingredients, preferences }) }
        ]
      })
    });
    if (!response.ok) throw new Error('OpenAI request failed: ' + response.status);
    const body = await response.json();
    return (body.output || []).flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text')
      .map(part => part.text).join('\n').slice(0, 5000);
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
    await takeQuota(request.auth.uid);
    const suggestion = await generateIdeas(openAIKey.value(), ingredients, preferences);
    if (!suggestion) throw new HttpsError('unavailable', 'No suggestions returned.');
    return {
      suggestion,
      disclaimer: 'AI suggestions may be inaccurate. Verify every ingredient and allergen label.'
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Pantry AI request failed', error);
    throw new HttpsError('unavailable', 'AI is temporarily unavailable. Use the standard recipe finder.');
  }
});
