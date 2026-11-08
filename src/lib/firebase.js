
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

// Check Firebase configuration
if (
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes("PASTE_YOUR") ||
  !firebaseConfig.projectId ||
  !firebaseConfig.appId
) {
  throw new Error(
    "Firebase configuration is invalid. Check your .env file."
  );
}

// Initialize Firebase
const app =
  firebase.apps.length > 0
    ? firebase.app()
    : firebase.initializeApp(firebaseConfig);

// Export Firebase
export { firebase };

// Firebase App
export function getFirebase() {
  return app;
}

// Firebase Authentication
export function getFirebaseAuth() {
  return app.auth();
}

// Cloud Firestore
export function getDb() {
  return app.firestore();
}

// Firestore Server Timestamp
export function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}
