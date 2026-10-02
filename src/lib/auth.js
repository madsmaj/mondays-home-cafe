import { getFirebaseAuth, getDb } from "./firebase";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`[AUTH] Failed to read ${key}:`, error);
    return null;
  }
}

export function normalizeUser(user) {
  if (!user) return null;

  const uid = user.uid || user.id || null;

  return {
    ...user,
    uid,
    id: user.id || uid,
  };
}

export async function getUserProfile(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const snapshot = await getDb()
    .collection("users")
    .doc(firebaseUser.uid)
    .get();

  // Never silently turn a missing staff profile into a customer.
  if (!snapshot.exists) {
    return null;
  }

  const profile = snapshot.data() || {};

  return normalizeUser({
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || "",
    email: profile.email || firebaseUser.email || "",
    phone: profile.phone || firebaseUser.phoneNumber || "",
    role: profile.role || null,
    rider_id: profile.rider_id || null,
    ...profile,
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
  });
}

async function saveProfile(firebaseUser, values = {}) {
  if (!firebaseUser?.uid) {
    throw new Error("Cannot save a profile without a Firebase user.");
  }

  const ref = getDb().collection("users").doc(firebaseUser.uid);
  const current = await ref.get();
  const existing = current.exists ? current.data() || {} : {};

  const data = {
    name: values.name ?? firebaseUser.displayName ?? "",
    email: values.email ?? firebaseUser.email ?? "",
    phone: values.phone ?? firebaseUser.phoneNumber ?? "",
    role: values.role ?? existing.role ?? "customer",
    uid: firebaseUser.uid,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    ...values,
    uid: firebaseUser.uid,
  };

  if (!current.exists) {
    data.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(data, { merge: true });

  return getUserProfile(firebaseUser);
}

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

    localStorage.setItem("customer", JSON.stringify(normalized));
    localStorage.removeItem("loggedUser");

    return normalized;
  },

  saveStaff(user) {
    const normalized = normalizeUser(user);

    if (!normalized) {
      throw new Error("Cannot save an empty staff profile.");
    }

    localStorage.setItem("loggedUser", JSON.stringify(normalized));
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

export function watchAuth(callback) {
  const firebaseAuth = getFirebaseAuth();

  return firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    try {
      const profile = await getUserProfile(firebaseUser);

      if (!profile) {
        console.error(
          "[AUTH] Firebase account exists but users/{uid} profile is missing.",
        );
        callback(null);
        return;
      }

      if (profile.role === "customer") {
        auth.saveCustomer(profile);
      } else if (profile.role === "admin" || profile.role === "rider") {
        auth.saveStaff(profile);
      } else {
        console.error("[AUTH] Unknown account role:", profile.role);
        callback(null);
        return;
      }

      callback(profile);
    } catch (error) {
      console.error("[AUTH] Auth state error:", error);
      callback(null);
    }
  });
}

export function useCurrentUser() {
  return auth.getUser();
}

export function getReturnTo() {
  try {
    const value = new URLSearchParams(window.location.search).get("returnTo");

    if (!value) return null;

    const safePattern =
      /^[a-zA-Z0-9_-]+\.html(?:\?[\w=&%-]*)?$|^\/[a-zA-Z0-9_/-]*(?:\?[\w=&%-]*)?$/;

    return safePattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

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
    default:
      return error?.message || "Login failed. Please try again.";
  }
}

export async function emailLogin(identifier, password, expectedRole) {
  const email = String(identifier || "").trim();

  if (!email) {
    throw new Error("Please enter your email address.");
  }

  if (!password) {
    throw new Error("Please enter your password.");
  }

  const firebaseAuth = getFirebaseAuth();

  try {
    const credential = await firebaseAuth.signInWithEmailAndPassword(
      email,
      password,
    );

    const profile = await getUserProfile(credential.user);

    if (!profile) {
      await firebaseAuth.signOut();
      throw new Error(
        "Your Firebase account exists, but its user profile is missing. Please ask the administrator to create users/{your Firebase UID}.",
      );
    }

    if (expectedRole && profile.role !== expectedRole) {
      await firebaseAuth.signOut();
      throw new Error(
        `This account is registered as "${profile.role || "unknown"}". Please use the correct login page.`,
      );
    }

    return profile;
  } catch (error) {
    if (
      error?.message?.startsWith("Your Firebase account exists") ||
      error?.message?.startsWith("This account is registered")
    ) {
      throw error;
    }

    console.error("[AUTH] Login failed:", error);
    throw new Error(firebaseLoginMessage(error));
  }
}

export async function customerRegister({
  name,
  email,
  phone,
  password,
}) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanPhone = String(phone || "").trim();

  if (!cleanName) throw new Error("Please enter your name.");
  if (!cleanEmail) throw new Error("Please enter your email.");
  if (!password) throw new Error("Please enter a password.");
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  try {
    const credential =
      await getFirebaseAuth().createUserWithEmailAndPassword(
        cleanEmail,
        password,
      );

    if (cleanName) {
      await credential.user.updateProfile({
        displayName: cleanName,
      });
    }

    return saveProfile(credential.user, {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: "customer",
    });
  } catch (error) {
    switch (error?.code) {
      case "auth/email-already-in-use":
        throw new Error("An account already exists with this email.");
      case "auth/invalid-email":
        throw new Error("Please enter a valid email address.");
      case "auth/weak-password":
        throw new Error("Password must be at least 6 characters.");
      default:
        throw new Error(error?.message || "Registration failed.");
    }
  }
}

export async function googleLogin() {
  try {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const result = await getFirebaseAuth().signInWithPopup(provider);

    if (!result?.user) {
      throw new Error("Google authentication did not return a user.");
    }

    const ref = getDb().collection("users").doc(result.user.uid);
    const existing = await ref.get();

    const role = existing.exists
      ? existing.data()?.role || "customer"
      : "customer";

    return saveProfile(result.user, { role });
  } catch (error) {
    console.error("[AUTH] Google login failed:", error);
    throw new Error(error?.message || "Google login failed.");
  }
}
