# NashtaBuddy web payments (pre-activation)

Branch: `feature/web-premium-razorpay-foundation`.

The web application uses Razorpay checkout. Android/iOS/Windows native apps should **not** embed Razorpay checkout or web upgrade links. They may call `getAccessStatus` after sign-in and on resume to refresh entitlements. The current native Android foundation has no purchase UI.

## Setup before enabling
1. Confirm final prices, GST treatment, plan duration, renewal policy and whether these are one-time access passes or recurring subscriptions. Current draft prices in `functions/razorpay.js` are ₹249/30 days and ₹1,999/365 days; this draft uses one-time orders, **not auto-renewing subscriptions**.
2. Add Firebase secrets via CLI (do not commit credentials): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_CHECKOUT_ENABLED` (keep `false` until ready).
3. In Razorpay dashboard configure webhook endpoint from deployed `razorpayWebhook` function for `payment.captured`; enter the exact same webhook secret in Firebase. Capture payments in dashboard settings and validate test-mode settlement.
4. Deploy Functions and Hosting only after reviewing this branch, checking Firebase App Check and running local builds. Confirm Firestore rules remain server-only for entitlements.
5. Test successful payment, canceled checkout, incorrect signatures, repeated webhooks, mismatched users, expired entitlements and app refresh. Do not switch to live keys until these pass.
6. Review refunds, chargebacks, recurring renewal, tax invoices and cancellation terms before public launch; the current foundation does **not** automatically revoke refunded purchases.

## Shared flow
Web checkout → `createRazorpayOrder` → Razorpay → `verifyRazorpayPayment` and signed `razorpayWebhook` → server-owned `users/{uid}/entitlements/ai` → `getAccessStatus` → web/native clients.

The webhook verifies the raw request signature; payment details are independently retrieved from Razorpay; Firestore transactions make duplicate notifications idempotent. Users cannot write their own entitlements.

## Status
Prepared on a feature branch only. Not deployed or live. No secrets configured. No real transactions tested.
