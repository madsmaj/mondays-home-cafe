
import { firebase, getFirebaseAuth, getDb } from "./firebase";

// ------------------------------
// Local Storage Helpers
// ------------------------------

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`[AUTH] Failed to read ${key}:`, error);
    return null;
  }
}

// ------------------------------
// Normalize User
// ------------------------------

export function normalizeUser(user) {
  if (!user) return null;

  const uid = user.uid || user.id || null;

  return {
    ...user,
    uid,
    id: user.id || uid,
  };
}

// ------------------------------
// Get User Profile
// ------------------------------

export async function getUserProfile(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const snapshot = await getDb()
    .collection("users")
    .doc(firebaseUser.uid)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const profile = snapshot.data() || {};

  return normalizeUser({
    ...profile,
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || "",
    email: profile.email || firebaseUser.email || "",
    phone: profile.phone || firebaseUser.phoneNumber || "",
    role: profile.role || null,
    rider_id: profile.rider_id || null,
  });
}

// ------------------------------
// Save User Profile
// ------------------------------

async function saveProfile(firebaseUser, values = {}) {
  if (!firebaseUser?.uid) {
    throw new Error("Cannot save a profile without a Firebase user.");
  }

  const db = getDb();

  const ref = db
    .collection("users")
    .doc(firebaseUser.uid);

  const current = await ref.get();

  const existing = current.exists
    ? current.data() || {}
    : {};

  const data = {
    ...existing,
    name: values.name ?? firebaseUser.displayName ?? "",
    email: values.email ?? firebaseUser.email ?? "",
    phone: values.phone ?? firebaseUser.phoneNumber ?? "",
    role: values.role ?? existing.role ?? "customer",
    uid: firebaseUser.uid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...values,
    uid: firebaseUser.uid,
  };

  if (!current.exists) {
    data.createdAt =
      firebase.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(data, { merge: true });

  return getUserProfile(firebaseUser);
}

// ------------------------------
// Authentication Helper
// ------------------------------

export const auth = {
  readCustomer() {
    return normalizeUser(readJson("customer"));
  },

  readStaff() {
    return normalizeUser(readJson("loggedUser"));
  },

  getUser() {
    return this.readCustomer() || this.readStaff();
  },

  getUserForRole(role) {
    const user = this.getUser();

    return user?.role === role ? user : null;
  },

  saveCustomer(user) {
    const normalized = normalizeUser(user);

    if (!normalized) {
      throw new Error("Cannot save an empty customer profile.");
    }

    localStorage.setItem(
      "customer",
      JSON.stringify(normalized)
    );

    localStorage.removeItem("loggedUser");

    return normalized;
  },

  saveStaff(user) {
    const normalized = normalizeUser(user);

    if (!normalized) {
      throw new Error("Cannot save an empty staff profile.");
    }

    localStorage.setItem(
      "loggedUser",
      JSON.stringify(normalized)
    );

    localStorage.removeItem("customer");

    return normalized;
  },

  async clear() {
    localStorage.removeItem("customer");
    localStorage.removeItem("loggedUser");
    localStorage.removeItem("firebaseUser");

    try {
      await getFirebaseAuth().signOut();
    } catch (error) {
      console.warn("[AUTH] Sign-out failed:", error);
    }
  },
};

// ------------------------------
// Watch Firebase Authentication
// ------------------------------

export function watchAuth(callback) {
  const firebaseAuth = getFirebaseAuth();

  return firebaseAuth.onAuthStateChanged(
    async (firebaseUser) => {
      if (!firebaseUser) {
        localStorage.removeItem("customer");
        localStorage.removeItem("loggedUser");

        callback(null);
        return;
      }

      try {
        const profile = await getUserProfile(firebaseUser);

        if (!profile) {
          console.error(
            "[AUTH] Firebase account exists, but the user profile is missing."
          );

          callback(null);
          return;
        }

        if (profile.role === "customer") {
          auth.saveCustomer(profile);
        } else if (
          profile.role === "admin" ||
          profile.role === "rider"
        ) {
          auth.saveStaff(profile);
        } else {
          console.error(
            "[AUTH] Unknown account role:",
            profile.role
          );

          callback(null);
          return;
        }

        callback(profile);
      } catch (error) {
        console.error("[AUTH] Auth state error:", error);
        callback(null);
      }
    }
  );
}

// ------------------------------
// Get Current User
// ------------------------------

export function useCurrentUser() {
  return auth.getUser();
}

// ------------------------------
// Get Safe Return Path
// ------------------------------

export function getReturnTo() {
  try {
    const value = new URLSearchParams(
      window.location.search
    ).get("returnTo");

    if (!value) return null;

    // Only allow internal paths
    if (!value.startsWith("/") || value.startsWith("//")) {
      return null;
    }

    // Reject unsafe characters and protocol-relative URLs
    if (
      value.includes("\\") ||
      value.includes("://") ||
      /[\u0000-\u001F]/.test(value)
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

// ------------------------------
// Firebase Login Error Messages
// ------------------------------

function firebaseLoginMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-disabled":
      return "This account has been disabled.";

    case "auth/user-not-found":
      return "No account was found with this email.";

    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/too-many-requests":
      return "Too many login attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";

    case "auth/operation-not-allowed":
      return "This login method is not enabled in Firebase.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "Missing or insufficient Firestore permissions.";

    default:
      return error?.message || "Login failed. Please try again.";
  }
}

// ------------------------------
// Email and Password Login
// ------------------------------

export async function emailLogin(
  identifier,
  password,
  expectedRole
) {
  const email = String(identifier || "").trim();

  if (!email) {
    throw new Error("Please enter your email address.");
  }

  if (!password) {
    throw new Error("Please enter your password.");
  }

  const firebaseAuth = getFirebaseAuth();

  try {
    const credential =
      await firebaseAuth.signInWithEmailAndPassword(
        email,
        password
      );

    const profile = await getUserProfile(credential.user);

    if (!profile) {
      await firebaseAuth.signOut();

      throw new Error(
        "Your Firebase account exists, but its user profile is missing. Please ask the administrator to create your user profile."
      );
    }

    if (
      expectedRole &&
      profile.role !== expectedRole
    ) {
      await firebaseAuth.signOut();

      throw new Error(
        `This account is registered as "${
          profile.role || "unknown"
        }". Please use the correct login page.`
      );
    }

    if (profile.role === "customer") {
      auth.saveCustomer(profile);
    } else if (
      profile.role === "admin" ||
      profile.role === "rider"
    ) {
      auth.saveStaff(profile);
    }

    return profile;
  } catch (error) {
    if (
      error?.message?.startsWith(
        "Your Firebase account exists"
      ) ||
      error?.message?.startsWith(
        "This account is registered"
      )
    ) {
      throw error;
    }

    console.error("[AUTH] Login failed:", error);

    throw new Error(firebaseLoginMessage(error));
  }
}

// ------------------------------
// Customer Registration
// ------------------------------

export async function customerRegister({
  name,
  email,
  phone,
  password,
}) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanPhone = String(phone || "").trim();

  if (!cleanName) {
    throw new Error("Please enter your name.");
  }

  if (!cleanEmail) {
    throw new Error("Please enter your email.");
  }

  if (!password) {
    throw new Error("Please enter a password.");
  }

  if (password.length < 6) {
    throw new Error(
      "Password must be at least 6 characters."
    );
  }

  try {
    const credential =
      await getFirebaseAuth().createUserWithEmailAndPassword(
        cleanEmail,
        password
      );

    await credential.user.updateProfile({
      displayName: cleanName,
    });

    const profile = await saveProfile(
      credential.user,
      {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: "customer",
      }
    );

    if (profile) {
      auth.saveCustomer(profile);
    }

    return profile;
  } catch (error) {
    switch (error?.code) {
      case "auth/email-already-in-use":
        throw new Error(
          "An account already exists with this email."
        );

      case "auth/invalid-email":
        throw new Error(
          "Please enter a valid email address."
        );

      case "auth/weak-password":
        throw new Error(
          "Password must be at least 6 characters."
        );

      default:
        console.error("[AUTH] Registration failed:", error);

        throw new Error(
          error?.message || "Registration failed."
        );
    }
  }
}

// ------------------------------
// Google Login
// ------------------------------

export async function googleLogin() {
  try {
    const provider =
      new firebase.auth.GoogleAuthProvider();

    provider.setCustomParameters({
      prompt: "select_account",
    });

    const result =
      await getFirebaseAuth().signInWithPopup(provider);

    if (!result?.user) {
      throw new Error(
        "Google authentication did not return a user."
      );
    }

    const ref = getDb()
      .collection("users")
      .doc(result.user.uid);

    const existing = await ref.get();

    const role = existing.exists
      ? existing.data()?.role || "customer"
      : "customer";

    const profile = await saveProfile(
      result.user,
      {
        role,
        name: result.user.displayName || "",
        email: result.user.email || "",
      }
    );

    if (profile?.role === "customer") {
      auth.saveCustomer(profile);
    } else if (
      profile?.role === "admin" ||
      profile?.role === "rider"
    ) {
      auth.saveStaff(profile);
    }

    return profile;
  } catch (error) {
    console.error(
      "[AUTH] Google login failed:",
      error
    );

    if (
      error?.code === "permission-denied" ||
      error?.code === "firestore/permission-denied"
    ) {
      throw new Error(
        "Missing or insufficient Firestore permissions. Please check your Firestore Security Rules."
      );
    }

    throw new Error(
      error?.message || "Google login failed."
    );
  }
}
