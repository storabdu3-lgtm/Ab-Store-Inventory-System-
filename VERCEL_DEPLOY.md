# Vercel deployment

This project is a Vite + React SPA. `vercel.json` is included so routes such as `/dashboard` and `/products` work after refresh.

## 1. Import the project
Upload this folder/ZIP to GitHub, then import the repository into Vercel. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.

## 2. Add Environment Variables in Vercel
Add these for **Production, Preview, and Development** as needed:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

Do not put service-account private keys in these `VITE_` variables. Firebase web config values are intended for the browser; protect the data with Firebase Authentication and Firestore/Storage Security Rules.

## 3. Firebase
In Firebase Console, enable Authentication (Email/Password), create/choose the Firestore database, and configure Storage. Add your Vercel production domain to Authentication > Settings > Authorized domains.

Create Firestore/Storage security rules appropriate for your users before going live.

## 4. Cloudinary
Create an **unsigned** upload preset for browser uploads, then copy the Cloud name and preset name into the two Cloudinary variables above. Keep signed-upload API secrets server-side; never expose an API secret in a `VITE_` variable.

## 5. Deploy
After saving the environment variables, redeploy. If you change an environment variable, trigger a new deployment because Vite embeds `VITE_*` values at build time.
