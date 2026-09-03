// ========================================
// Zano - Production Seat Migration
// 49-seat layout -> 30-seat VIP 2+1 layout
//
// SAFE FEATURES:
// - Supports --dry-run
// - Preserves historical paid bookings
// - Does not delete old seat documents
// - Retires seats outside the new 30-seat layout
// - Resets active seat templates to available
// - Date-specific bookings remain in tripSeatInventory
// ========================================

const admin = require("../functions/node_modules/firebase-admin");

// ========================================
// Safety Check
// ========================================

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ FIRESTORE_EMULATOR_HOST is set. Production migration cancelled."
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

const VIP_ROWS = 10;
const VIP_COLUMNS = ["A", "B", "C"];
const TOTAL_ACTIVE_SEATS = 30;

const DRY_RUN = process.argv.includes("--dry-run");

// ========================================
// Generate New Valid Seat Numbers
//
// 1A 1B | 1C
// ...
// 10A 10B | 10C
// ========================================

function generateValidSeatNumbers() {
  const seatNumbers = [];

  for (let row = 1; row <= VIP_ROWS; row++) {
    for (const column of VIP_COLUMNS) {
      seatNumbers.push(`${row}${column}`);
    }
  }

  return seatNumbers;
}

// ========================================
// Main Migration
// ========================================

async function migrateSeats() {
  try {
    console.log("");
    console.log("========================================");
    console.log("ZANO 30-SEAT VIP MIGRATION");
    console.log("========================================");
    console.log(`Trip: ${TRIP_ID}`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE MIGRATION"}`);
    console.log("");

    const tripRef = db.collection("trips").doc(TRIP_ID);
    const tripSnapshot = await tripRef.get();

    if (!tripSnapshot.exists) {
      throw new Error(`Trip ${TRIP_ID} does not exist.`);
    }

    // ========================================
    // Load Current Seat Templates
    // ========================================

    const seatSnapshot = await db
      .collection("seats")
      .where("tripId", "==", TRIP_ID)
      .get();

    console.log(`Existing seat templates: ${seatSnapshot.size}`);

    if (seatSnapshot.empty) {
      throw new Error("No seat templates found for this trip.");
    }

    const validSeatNumbers = new Set(generateValidSeatNumbers());

    if (validSeatNumbers.size !== TOTAL_ACTIVE_SEATS) {
      throw new Error(
        `Expected ${TOTAL_ACTIVE_SEATS} valid seats but generated ${validSeatNumbers.size}.`
      );
    }

    const activeSeats = [];
    const retiredSeats = [];

    seatSnapshot.docs.forEach((document) => {
      const data = document.data();
      const seatNumber = String(data.seatNumber ?? "").trim();

      if (validSeatNumbers.has(seatNumber)) {
        activeSeats.push({
          id: document.id,
          seatNumber,
          ref: document.ref,
          data,
        });
      } else {
        retiredSeats.push({
          id: document.id,
          seatNumber,
          ref: document.ref,
          data,
        });
      }
    });

    // ========================================
    // Validate 30 Required Seats Exist
    // ========================================

    const activeSeatNumberSet = new Set(
      activeSeats.map((seat) => seat.seatNumber)
    );

    const missingSeats = [...validSeatNumbers].filter(
      (seatNumber) => !activeSeatNumberSet.has(seatNumber)
    );

    if (missingSeats.length > 0) {
      console.error("");
      console.error("❌ Migration cannot continue.");
      console.error(
        `Missing required seat templates: ${missingSeats.join(", ")}`
      );
      process.exit(1);
    }

    if (activeSeats.length !== TOTAL_ACTIVE_SEATS) {
      throw new Error(
        `Expected exactly ${TOTAL_ACTIVE_SEATS} active seat templates but found ${activeSeats.length}.`
      );
    }

    // ========================================
    // Protect Historical Confirmed/Paid Seats
    // ========================================

    const bookingSnapshot = await db
      .collection("bookings")
      .where("tripId", "==", TRIP_ID)
      .get();

    const protectedHistoricalSeats = [];

    bookingSnapshot.docs.forEach((document) => {
      const booking = document.data();

      const isConfirmed =
        booking.status === "confirmed" &&
        booking.paymentStatus === "successful";

      if (!isConfirmed) {
        return;
      }

      const seatNumbers = Array.isArray(booking.seatNumbers)
        ? booking.seatNumbers
        : [];

      seatNumbers.forEach((seatNumber) => {
        if (!validSeatNumbers.has(seatNumber)) {
          protectedHistoricalSeats.push({
            bookingId: document.id,
            bookingReference: booking.bookingReference ?? "",
            travelDate: booking.travelDate ?? "",
            seatNumber,
          });
        }
      });
    });

    // ========================================
    // Preview
    // ========================================

    console.log("");
    console.log("NEW ACTIVE VIP SEATS");
    console.log("----------------------------------------");
    console.log(
      activeSeats
        .map((seat) => seat.seatNumber)
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        )
        .join(", ")
    );

    console.log("");
    console.log(`Active seat count: ${activeSeats.length}`);

    console.log("");
    console.log("SEATS TO RETIRE");
    console.log("----------------------------------------");

    console.log(
      retiredSeats
        .map((seat) => seat.seatNumber)
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        )
        .join(", ")
    );

    console.log("");
    console.log(`Retired seat count: ${retiredSeats.length}`);

    console.log("");
    console.log("PROTECTED HISTORICAL PAID SEATS");
    console.log("----------------------------------------");

    if (protectedHistoricalSeats.length === 0) {
      console.log("None");
    } else {
      protectedHistoricalSeats.forEach((item) => {
        console.log(
          `${item.seatNumber} | ${item.bookingReference} | ${item.travelDate}`
        );
      });
    }

    // ========================================
    // Dry Run Stops Here
    // ========================================

    if (DRY_RUN) {
      console.log("");
      console.log("========================================");
      console.log("✅ DRY RUN COMPLETE");
      console.log("NO FIRESTORE DATA WAS CHANGED.");
      console.log("========================================");
      console.log("");

      process.exit(0);
    }

    // ========================================
    // LIVE MIGRATION
    // ========================================

    const batch = db.batch();

    // ========================================
    // Keep New 30 Seats Active
    //
    // Important:
    // Template status becomes available.
    // Actual booked/reserved state remains
    // date-specific in tripSeatInventory.
    // ========================================

    activeSeats.forEach((seat) => {
      const seatNumber = seat.seatNumber;

      const row = parseInt(seatNumber.match(/\d+/)?.[0] ?? "0", 10);
      const column = seatNumber.replace(/\d+/g, "");

      batch.update(seat.ref, {
        row,
        column,

        active: true,
        retired: false,

        status: "available",

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // ========================================
    // Retire Old 19 Seats
    //
    // DO NOT DELETE.
    // Historical bookings/tickets may reference them.
    // ========================================

    retiredSeats.forEach((seat) => {
      batch.update(seat.ref, {
        active: false,
        retired: true,

        status: "unavailable",

        retiredReason: "30-seat-vip-layout-migration",

        retiredAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // ========================================
    // Update Trip Capacity/Layout
    // ========================================

    batch.update(tripRef, {
      totalSeats: TOTAL_ACTIVE_SEATS,
      availableSeats: TOTAL_ACTIVE_SEATS,

      seatLayout: "vip-2-plus-1",
      seatRows: VIP_ROWS,
      seatColumns: VIP_COLUMNS,

      inventoryType: "date-based",

      updatedAt:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    // ========================================
    // Commit
    // ========================================

    await batch.commit();

    // ========================================
    // Verify Result
    // ========================================

    const verificationSnapshot = await db
      .collection("seats")
      .where("tripId", "==", TRIP_ID)
      .get();

    let activeCount = 0;
    let retiredCount = 0;

    verificationSnapshot.docs.forEach((document) => {
      const seat = document.data();

      if (seat.active === true && seat.retired !== true) {
        activeCount += 1;
      }

      if (seat.retired === true) {
        retiredCount += 1;
      }
    });

    console.log("");
    console.log("========================================");
    console.log("✅ MIGRATION COMPLETED");
    console.log("========================================");
    console.log(`Active VIP seats: ${activeCount}`);
    console.log(`Retired seats: ${retiredCount}`);
    console.log(`Trip capacity: ${TOTAL_ACTIVE_SEATS}`);
    console.log("Layout: VIP 2 + 1");
    console.log("Rows: 10");
    console.log("Columns: A B | C");

    if (protectedHistoricalSeats.length > 0) {
      console.log("");
      console.log("Protected historical seats:");

      protectedHistoricalSeats.forEach((item) => {
        console.log(
          `- ${item.seatNumber} (${item.bookingReference})`
        );
      });
    }

    console.log("========================================");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("❌ Migration failed:");
    console.error(error);
    process.exit(1);
  }
}

migrateSeats();