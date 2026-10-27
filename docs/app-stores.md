# Putting the app in the App Store and Google Play

The iOS and Android apps are the same website wrapped by Capacitor. Everything that can be prepared without an account is already in `frontend/`:

- `frontend/capacitor.config.ts` (app id `com.nishmethuku.networth`, name "Net Worth")
- `frontend/ios/` and `frontend/android/` (the native projects)
- app icons and splash screens (made from `frontend/resources/icon.png`)
- the backend already accepts requests from the apps

## What only you can do

1. **Apple Developer Program** ($99 per year): https://developer.apple.com/programs/
2. **Google Play Console** ($25 one time): https://play.google.com/console/signup
3. A Mac with Xcode for the iOS build (Apple requires it). Android Studio works on any computer.

## Build steps

1. Copy `frontend/.env.native.example` to `frontend/.env.native` and fill in the real Supabase values.
2. From `frontend/`: `npm run cap:sync` (builds the site and copies it into both apps).
3. iOS: `npm run cap:ios`, then in Xcode choose your team under Signing & Capabilities, pick "Any iOS Device", and use Product > Archive > Distribute App.
4. Android: `npm run cap:android`, then in Android Studio use Build > Generate Signed Bundle (AAB). Keep the signing key file safe; losing it means you cannot update the app.

## Store listing items to prepare

- Privacy policy web page (required by both stores). The app stores money data, so say what is saved and that it is not sold.
- Screenshots: 6.7 inch iPhone and 5.5 inch iPhone, plus Android phone screenshots.
- A short and a long description, and a support email.
- Because the app handles financial data, answer the stores' data safety questions honestly (account email, financial info, stored on Supabase).
- Apple may ask for a demo login. The app has a demo mode you can mention in the review notes.

## Known limits

- Push notifications use the web push service, which does not work inside the iOS app. A native push setup (Apple push key and Firebase) is a later step.
- Password reset emails open the website, not the app. Add deep links later if wanted.
- I could not run an Android or iOS build in the cloud workspace (no SDK or Xcode), so the first build on your computer may need small fixes.
