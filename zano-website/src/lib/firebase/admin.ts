// ========================================
// Zano - Firebase Admin
// Server-side Firebase connection
// ========================================

import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

// ========================================
// Firebase Admin Credentials
// ========================================

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const clientEmail =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

const privateKey =
  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

// ========================================
// Initialize Firebase Admin
// ========================================

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  if (!projectId) {
    throw new Error(
      "Firebase Admin project ID is missing."
    );
  }

  // Production/server deployment:
  // use explicit service-account credentials when supplied.
  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  // Local development:
  // use Google Application Default Credentials.
  return initializeApp({
    credential: applicationDefault(),
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