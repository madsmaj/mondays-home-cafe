const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function getFirebase() {
  if (!window.firebase) {
    throw new Error(
      'Firebase SDK did not load. Check your internet connection or Firebase CDN configuration.'
    );
  }

  if (!window.__mondaysFirebaseApp) {
    window.__mondaysFirebaseApp = window.firebase.initializeApp(firebaseConfig);
  }

  return window.firebase;
}

export function getFirebaseAuth() {
  return getFirebase().auth();
}

export function getDb() {
  return getFirebase().firestore();
}

export function serverTimestamp() {
  return getFirebase().firestore.FieldValue.serverTimestamp();
}
