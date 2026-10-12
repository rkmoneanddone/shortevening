# Billing deployment (without Razorpay credentials)

The public `getBillingPlans` callable is deployed from the separate `billing` Functions codebase. It uses Firebase App Check and reads `publicConfig/billing` from Firestore. It does **not** require Razorpay credentials.

## Deploy

From repository root:

```powershell
git pull origin feature/web-premium-razorpay-foundation
cd billing-functions
npm install
cd ..
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
firebase deploy --only functions:billing --project shortevening-844df
firebase functions:list --project shortevening-844df
```

Expected deployed function: `getBillingPlans` in `asia-south1`.

## Firestore plan format

Document: `publicConfig/billing`. Sample **non-production** values:

```json
{
  "plans": {
    "monthly": {"enabled": true, "amountMinor": 139900, "durationDays": 30, "currency": "INR"},
    "yearly": {"enabled": false, "amountMinor": 1399000, "durationDays": 365, "currency": "INR"}
  }
}
```

Amounts are in paise; these are illustrative, not approved prices. Set the actual plan values in Firestore before launch. The UI reads prices from this document via the callable function.

Razorpay credentials are **not** required for this deploy. Do not deploy `functions:default` until actual payment credentials and rollout plan are ready. Keep checkout disabled until live payment verification, webhooks, and refund handling have been tested.

## Troubleshooting

If the function is deployed but calls fail with HTTP 401, check Firebase App Check registration, the configured reCAPTCHA Enterprise key, and domain allowlisting for `nashtabuddy.in`. Do not disable App Check to bypass the error.
