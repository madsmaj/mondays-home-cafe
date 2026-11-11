import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const required = ["apiKey", "authDomain", "projectId", "appId"];
const missing = required.filter((key) => !String(firebaseConfig[key] || "").trim());
if (missing.length) {
  throw new Error(`Missing Firebase environment values: ${missing.join(", ")}. Check the .env file in the project root.`);
}

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const firebaseAuth = app.auth();

// Resolve persistence before login/listener setup. Firebase Auth persists
// sessions across reloads in the same browser.
export const authPersistenceReady = firebaseAuth.setPersistence(
  firebase.auth.Auth.Persistence.LOCAL
);

export { firebase };
export const getFirebase = () => app;
export const getFirebaseAuth = () => firebaseAuth;
export const getDb = () => app.firestore();
export const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
