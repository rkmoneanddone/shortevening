# SortEvening — Plug-and-play architecture

## Client rule
Web, Android and iOS are presentation layers. They share typed request/response contracts in `shared/contracts.ts`. Clients never decide Premium status, calculate payment entitlements, call AI providers with secret keys or write privileged recommendation records.

## Modules and boundaries
- Identity: Firebase Auth Google provider; backend validates Firebase ID tokens.
- Profiles: authenticated per-user preferences; schema validation on all writes.
- Catalog: versioned published recipe records with allergens, diet and duration.
- Recommendation service: server-selected three recipes; deterministic daily cache per user/date/timezone; avoid recently made dish families where enough safe options exist.
- Cooking history and favorites: user-scoped records, idempotent writes for Made Today.
- Entitlements: server-owned trial start/end and paid access; one source of truth.
- Billing: Razorpay adapter creates checkout sessions; signed webhook verifies payment signatures and updates entitlements idempotently.
- AI: provider adapter behind a server-only interface with per-user quotas, moderation and strict recipe/allergen validation.
- Notifications: optional provider adapter; no dependency in core cooking flow.

## API versioning
Expose authenticated HTTPS endpoints under `/v1` or Firebase callable functions with versioned names. Use shared schemas and typed errors. Keep API and database changes backward compatible for mobile releases.

## Security gates
1. Deny all unknown Firestore paths. Client may only read/write own permitted records. Server-only entitlement, billing and recommendation state.
2. App Check, Firebase Auth, rate limits and per-user quotas for costly operations.
3. Never trust user-supplied price, payment success, user ID or AI content.
4. Verify webhook signature, use idempotency keys and atomic transaction for billing.
5. Prevent allergy conflicts server-side; display ingredient verification warning.
6. Automated rules tests: cross-user denial, entitlement mutation denial, authenticated allowed operations.
7. Secrets in backend secret manager; public Firebase web configuration is not a secret.
8. Audit log and retention/deletion policy before launch.

## Delivery gates
A. Extract shared contracts and isolate Firebase adapters.
B. Build catalog + recommendations with tests, sufficient recipes and fallback.
C. History/favorites/profile end-to-end, rules and emulator tests.
D. Trial/Free/Premium entitlements and enforcement.
E. Razorpay checkout, webhook, reconciliation and sandbox test.
F. AI adapter and quotas with provider disabled by default.
G. Accessibility, responsive UI, end-to-end browser tests, production deployment and monitoring.
H. Native Android/iOS clients against the same versioned backend.

No gate is marked complete without tests and live verification.
