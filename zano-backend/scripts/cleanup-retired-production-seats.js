// ========================================
// Zano - Retired Production Seat Cleanup
//
// Removes ONLY retired seat templates
// after successful 49 -> 30 seat migration.
//
// DOES NOT TOUCH:
// - bookings
// - tickets
// - payments
// - tripSeatInventory
// ========================================

const admin = require("../functions/node_modules/firebase-admin");

// ========================================
// Production Safety
// ========================================

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ FIRESTORE_EMULATOR_HOST is set. Production cleanup cancelled."
  );
  process.exit(1);
}

// ========================================
// Firebase Admin
// ========================================

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "zano-969e2",
  });
}

const db = admin.firestore();

// ========================================
// Configuration
// ========================================

const TRIP_ID = "Q4manm60DhTFYT5j3gdm";

const EXPECTED_ACTIVE_SEATS = 30;
const EXPECTED_RETIRED_SEATS = 19;

// ========================================
// Cleanup
// ========================================

async function cleanupRetiredSeats() {
  try {
    console.log("");
    console.log("========================================");
    console.log("ZANO RETIRED SEAT CLEANUP");
    console.log("========================================");
    console.log(`Trip: ${TRIP_ID}`);
    console.log("");

    // ========================================
    // Load All Seat Templates
    // ========================================

    const seatSnapshot = await db
      .collection("seats")
      .where("tripId", "==", TRIP_ID)
      .get();

    const activeSeats = [];
    const retiredSeats = [];

    seatSnapshot.docs.forEach((document) => {
      const seat = document.data();

      if (
        seat.active === true &&
        seat.retired !== true
      ) {
        activeSeats.push({
          id: document.id,
          seatNumber: seat.seatNumber,
          ref: document.ref,
        });
      }

      if (
        seat.retired === true &&
        seat.active === false
      ) {
        retiredSeats.push({
          id: document.id,
          seatNumber: seat.seatNumber,
          ref: document.ref,
        });
      }
    });

    // ========================================
    // Safety Validation
    // ========================================

    console.log(
      `Total seat templates before cleanup: ${seatSnapshot.size}`
    );

    console.log(
      `Active seats: ${activeSeats.length}`
    );

    console.log(
      `Retired seats: ${retiredSeats.length}`
    );

    if (
      activeSeats.length !== EXPECTED_ACTIVE_SEATS
    ) {
      throw new Error(
        `Safety check failed. Expected ${EXPECTED_ACTIVE_SEATS} active seats but found ${activeSeats.length}.`
      );
    }

    if (
      retiredSeats.length !== EXPECTED_RETIRED_SEATS
    ) {
      throw new Error(
        `Safety check failed. Expected ${EXPECTED_RETIRED_SEATS} retired seats but found ${retiredSeats.length}.`
      );
    }

    // ========================================
    // Show Seats Being Deleted
    // ========================================

    console.log("");
    console.log("RETIRED SEATS TO DELETE");
    console.log("----------------------------------------");

    console.log(
      retiredSeats
        .map((seat) => seat.seatNumber)
        .sort((a, b) =>
          String(a).localeCompare(
            String(b),
            undefined,
            { numeric: true }
          )
        )
        .join(", ")
    );

    // ========================================
    // Delete ONLY Retired Templates
    // ========================================

    const batch = db.batch();

    retiredSeats.forEach((seat) => {
      batch.delete(seat.ref);
    });

    await batch.commit();

    // ========================================
    // Verify
    // ========================================

    const verificationSnapshot = await db
      .collection("seats")
      .where("tripId", "==", TRIP_ID)
      .get();

    let finalActiveCount = 0;

    verificationSnapshot.docs.forEach((document) => {
      const seat = document.data();

      if (
        seat.active === true &&
        seat.retired !== true
      ) {
        finalActiveCount += 1;
      }
    });

    if (
      verificationSnapshot.size !== EXPECTED_ACTIVE_SEATS ||
      finalActiveCount !== EXPECTED_ACTIVE_SEATS
    ) {
      throw new Error(
        `Cleanup verification failed. Expected exactly ${EXPECTED_ACTIVE_SEATS} remaining seats.`
      );
    }

    console.log("");
    console.log("========================================");
    console.log("✅ CLEANUP COMPLETE");
    console.log("========================================");
    console.log(
      `Total seat templates: ${verificationSnapshot.size}`
    );
    console.log(
      `Active seat templates: ${finalActiveCount}`
    );
    console.log("Retired seat templates: 0");
    console.log("Trip capacity: 30");
    console.log("========================================");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("❌ Cleanup failed:");
    console.error(error);
    process.exit(1);
  }
}

cleanupRetiredSeats();