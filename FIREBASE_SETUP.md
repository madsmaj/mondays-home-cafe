# Firebase setup — Monday's Home Cafe

## Local setup

This archive includes a `.env` file populated with the Firebase web configuration visible in the project-settings screenshot you supplied. If Firebase reports `auth/invalid-api-key`, re-copy the API key directly from Firebase Console > Project settings > Your apps > Config and replace `VITE_FIREBASE_API_KEY` in `.env`.

1. Open this folder in VS Code (the folder containing `package.json`).
2. Run `npm install`.
3. Run `npm run dev`.
4. Firebase Console > Authentication > Sign-in method: enable Email/Password and Google as needed.
5. Authentication > Settings > Authorized domains: ensure `localhost` is listed for local development.

After editing `.env`, restart Vite with Ctrl+C, then `npm run dev`.

## Firestore

- Menu reads from the `menu` collection.
- Checkout calls `create-order` in `src/lib/api.js`, which writes a new document to the Firestore `orders` collection. It stores the order number, customer details, delivery address, items and quantities, total, payment details, status, and server timestamps.
- Publish the included `firestore.rules` in Firebase Console > Firestore Database > Rules. Review role/authorization conditions before production.

Firebase web config values (including the API key) are client-side identifiers, not admin credentials. Do not add service-account private keys to this React app. Restrict the API key in Google Cloud Console as appropriate.
