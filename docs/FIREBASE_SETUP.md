# Firebase Android Setup

Firebase project: `shortevening-844df`

Already confirmed:
- Firestore enabled
- Google Authentication enabled

Still required before device verification:
1. Register the Android application in Firebase using the final Android package name.
2. Add SHA-1 and SHA-256 fingerprints for the development signing certificate.
3. Download `google-services.json` and place it at `android/app/google-services.json`.
4. Copy the Firebase/Google OAuth **Web Client ID** into the secure build configuration used by `GOOGLE_WEB_CLIENT_ID` (the current source placeholder is intentionally empty).
5. Ensure the Google Services Gradle plugin is enabled in the generated Android project.
6. Deploy/test `firestore.rules` before storing production user data.

Do not commit private signing keys, Razorpay secrets, or AI provider secrets.
