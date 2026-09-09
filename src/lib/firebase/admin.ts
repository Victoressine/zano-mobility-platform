// ========================================
// Zano - Firebase Admin
// Server-side Firebase connection
// ========================================

import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ========================================
// Firebase Admin Credentials
// ========================================

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n"
);

// ========================================
// Validate credentials
// ========================================

if (!projectId) {
  throw new Error(
    "Firebase Admin project ID is missing. Add FIREBASE_ADMIN_PROJECT_ID to .env.local."
  );
}

if (!clientEmail) {
  throw new Error(
    "Firebase Admin client email is missing. Add FIREBASE_ADMIN_CLIENT_EMAIL to .env.local."
  );
}

if (!privateKey) {
  throw new Error(
    "Firebase Admin private key is missing. Add FIREBASE_ADMIN_PRIVATE_KEY to .env.local."
  );
}

// ========================================
// Initialize Firebase Admin
// ========================================

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });
}

const adminApp = initializeFirebaseAdmin();

// ========================================
// Server-only Firebase Services
// ========================================

export const adminAuth = getAuth(adminApp);

export const adminDb = getFirestore(adminApp);

export default adminApp;