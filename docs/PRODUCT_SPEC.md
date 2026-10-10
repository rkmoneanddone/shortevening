# NashtaBuddy — Current Product Rules (October 2026)

## Access tiers (server-authoritative)

| Feature | First 30 days (Trial) | Active Premium | Free after trial / expired subscription |
| --- | --- | --- | --- |
| AI snack requests | 5 per UTC day | 5 per UTC day | 2 per UTC day |
| History shown | 7 days initially, previous 7 on request | Same | 1 day only |
| Favorites | Up to 10; first 5 loaded | Same | Hidden; existing data preserved |
| Daily default picks | Rotate each day | Rotate each day | Same picks each day, subject to dietary preferences |
| Older records | Retained in Firestore | Retained in Firestore | Retained in Firestore, not deleted |

Trial starts from Firebase Authentication account creation and expires after 30 × 24 hours. Active paid entitlement takes precedence over trial. After payment expiration the user returns to Free unless still within the initial 30-day trial. Entitlement is stored at `users/{uid}/entitlements/ai` with `plan: 'paid'`, `status: 'active'`, and optional Firestore Timestamp `expiresAt`. Clients must never set entitlement values. The future payment webhook will manage this record; payment integration is intentionally excluded from this milestone.

The backend callable `getAccessStatus` resolves the effective tier; `suggestPantrySnacks` enforces daily quotas server-side. UI feature restrictions are currently display-side and need corresponding backend security hardening before launch, especially the favorites count and preventing direct Firestore access to hidden records. Daily free picks are deterministic for each profile; dietary preference changes may change them.

## Product and release backlog

- Verify build, Firestore indexes, end-to-end auth and functions on deployed web.
- Implemented: refund failed AI attempts, server-side 24-hour response cache, request latency logs. Still test concurrency and refund failures.
- Implemented: basic server-side allergen/diet/time filtering and pantry missing-ingredient recalculation; curated recipe catalog expanded to 21. Still requires comprehensive food safety validation and verified, licensed dish photography.
- Implemented: atomic favorite limit through backend callable and direct client favorite writes denied. Still restrict free-tier history and favorites reads at security rules/backend layer.
- Still implement history pagination beyond current 100-document cap, confirm boundary semantics and add automated tests.
- Add admin reporting (retaining existing history without duplicating full records), observability, budgets and rate limiting.
- Complete native Android application, Google Sign-In configuration, and device testing — deferred.
- Implement Razorpay, webhooks, billing and subscription renewal — deferred.
- iOS comes after Android.

## Technology
React + TypeScript + Vite web, React Native CLI Android foundation, Firebase Auth/Firestore/Functions, server-side OpenAI. Normal daily picks do not require AI.
