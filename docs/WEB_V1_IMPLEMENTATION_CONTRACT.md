# SortEvening — Web V1 implementation contract

## Product
Mobile-first responsive web application. Google sign-in only. Exactly three useful snack recommendations per day. Same Firebase backend will serve future Android/iOS clients.

## Navigation
Authenticated bottom navigation on phones, sidebar on desktop: Home, History, Favorites, Profile. Every navigation item opens a working screen, never placeholder text. Profile header shows Google display name/photo, account email and sign out.

## First-run flow
1. Google sign-in with explicit loading, cancel and error states.
2. Household: adults and children as bounded +/- stepper controls (0–12 children, 1–12 adults). No free-form family string.
3. Diet: vegetarian, eggetarian, non-vegetarian; multi-select preferences.
4. Allergies: multi-select common allergens plus none, with a safety disclaimer that recipes require ingredient verification.
5. Typical preparation time: 10, 15, 20, 30+ minutes.
6. Review and save. Persist typed structured data to users/{uid}. On successful write navigate to Home. If write fails show actionable error and retry; never silently advance.

## Home
Greeting, household context, exactly 3 recipe cards, ingredient/time/difficulty badges, attractive responsive visuals, working recipe action, save favorite. Empty/loading/error states. Daily deterministic recommendations with no-repeat trial/premium logic implemented on backend later; never imply hard-coded picks are personalized.

## Recipe
Title, cooking time, servings, ingredients, numbered steps, substitutions (later AI), favorite, Made Today confirmation. Made Today writes to users/{uid}/history with recipe ID, dish family, timestamp; prevent accidental double submissions.

## History
Chronological real Firestore records, empty state, recipe link. Free users after trial see upgrade state while preserved data remains stored.

## Favorites
Read/write users/{uid}/favorites; empty state and remove action. Entitlement gated.

## Profile
Google identity, household editor, food preferences, allergies, time, plan/trial status, privacy/terms links, sign out.

## Data contract
users/{uid}: uid, displayName, email, photoURL, household:{adults,children}, diet, allergies[], preferredMinutes, onboardingCompleted, createdAt, updatedAt.
users/{uid}/history/{eventId}: recipeId, dishFamily, dishName, madeAt.
users/{uid}/favorites/{recipeId}: recipeId, createdAt.
recipes/{recipeId}: name, dishFamily, dietTags[], allergens[], ingredients[], steps[], durationMinutes, difficulty, published.
users/{uid}/entitlements/current: plan, trialStartedAt, trialEndsAt, premiumUntil, updatedAt (server-controlled).

## Security and correctness
Authenticated user can read own profile/history/favorites; cannot edit server-owned entitlement fields. Recipes readable by authenticated users, writable by admins only. No client-supplied payment entitlement. Verify rules in Firebase emulator before deploy. Deploy Firestore rules separately and confirm with a signed-in user. Always distinguish permission-denied, offline, and empty-state errors.

## Build and release gates
1. UX contract accepted.
2. Rules emulator tests pass and rules deployed.
3. Google login + structured onboarding end-to-end.
4. Three recommendation cards + recipe details.
5. Made Today/history/favorites/profile.
6. Trial/Premium/AI/payments only after core verified.
Each gate: implement → typecheck/build → functional verification → push → stop. No claim of deployment until Firebase Hosting deploy is confirmed.
