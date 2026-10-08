# SortEvening AI integration deployment

The API key is stored in Firebase Secret Manager under OPENAI_API_KEY. Never put it in GitHub, browser code or app bundles.

## Required before deployment

1. Set up Firebase App Check for the web app and future native apps. The callable function enforces App Check and will reject requests without valid tokens.
2. Ensure Cloud Functions v2 billing is enabled and the OpenAI project has sufficient API credits.
3. Verify the configured OpenAI model is available to the project.
4. Install backend dependencies: `cd F:\\projects\\ShortEvening\\functions; npm install; npm run check`.
5. Deploy after tests: `firebase deploy --only functions:suggestPantrySnacks --project shortevening-844df`.
6. Integrate web callable client and perform end-to-end testing with a real App Check token.

The endpoint requires Firebase Auth, accepts 1–20 ingredients, reads the signed-in user's preferences server-side, enforces five requests per UTC day per user, and returns a text suggestion. Output is **not independently allergen-verified**; do not claim allergy safety. Before production: implement structured allergen validation, server-controlled entitlement gating, integration tests, and spend monitoring.
