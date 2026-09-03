// ========================================
// Zano Firebase Functions
// Application Entry Point
// ========================================

import {initializeApp, getApps} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions/v2";

// ========================================
// Initialize Firebase Admin
// Must happen before Firestore is used
// ========================================

if (getApps().length === 0) {
  initializeApp();
}

// ========================================
// Global Function Configuration
// ========================================

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

// ========================================
// Booking Functions
// ========================================

export {createBooking} from "./bookings/createBooking";
export {getBooking} from "./bookings/getBooking";
export {
  releaseExpiredBookings,
} from "./bookings/releaseExpiredBookings";

// ========================================
// Payment Functions
// ========================================

export {
  completeDemoPayment,
} from "./payments/completeDemoPayment";

// ========================================
// Receipt Functions
// ========================================

export {
  getReceipt,
} from "./receipts/getReceipt";