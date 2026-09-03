// ========================================
// Zano - Production VIP Seat Seeder
// Standard VIP Layout: 30 Seats
// Configuration: 2 + 1 (A B | C)
// ========================================

const admin = require("../functions/node_modules/firebase-admin");

// ========================================
// Safety Check
// Never allow this script to target emulator
// ========================================

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ FIRESTORE_EMULATOR_HOST is set. Production seed cancelled."
  );
  process.exit(1);
}

// ========================================
// Initialize Firebase Admin
// ========================================

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "zano-969e2",
  });
}

const db = admin.firestore();

// ========================================
// Production Trip
// ========================================

const TRIP_ID = "Q4manm60DhTFYT5j3gdm";

// ========================================
// VIP Bus Configuration
// 10 rows × 3 seats = 30 seats
//
// A B | C
// ========================================

const VIP_ROWS = 10;
const VIP_COLUMNS = ["A", "B", "C"];
const TOTAL_SEATS = 30;

// ========================================
// Generate 30-seat VIP Layout
// ========================================

function generateSeats() {
  const seats = [];

  for (let row = 1; row <= VIP_ROWS; row++) {
    VIP_COLUMNS.forEach((column) => {
      seats.push({
        seatNumber: `${row}${column}`,
        row,
        column,
      });
    });
  }

  return seats;
}

// ========================================
// Seed Seats
// ========================================

async function seedProductionSeats() {
  try {
    const tripRef = db.collection("trips").doc(TRIP_ID);
    const tripSnapshot = await tripRef.get();

    // ========================================
    // Validate Trip
    // ========================================

    if (!tripSnapshot.exists) {
      throw new Error(`Trip ${TRIP_ID} does not exist.`);
    }

    const seats = generateSeats();

    if (seats.length !== TOTAL_SEATS) {
      throw new Error(
        `Invalid VIP configuration. Expected ${TOTAL_SEATS} seats but generated ${seats.length}.`
      );
    }

    // ========================================
    // Prevent Duplicate Seat Creation
    // ========================================

    const existingSeats = await db
      .collection("seats")
      .where("tripId", "==", TRIP_ID)
      .limit(1)
      .get();

    if (!existingSeats.empty) {
      console.error(
        "❌ Seats already exist for this trip. Nothing was created."
      );
      console.error(
        "Use the seat migration script for an existing trip."
      );
      process.exit(1);
    }

    // ========================================
    // Create Seat Templates
    // ========================================

    const batch = db.batch();

    seats.forEach((seat) => {
      const seatRef = db.collection("seats").doc();

      batch.set(seatRef, {
        tripId: TRIP_ID,

        seatNumber: seat.seatNumber,
        row: seat.row,
        column: seat.column,

        status: "available",

        active: true,
        retired: false,

        price: 120,

        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // ========================================
    // Update Trip Capacity
    // ========================================

    batch.update(tripRef, {
      totalSeats: TOTAL_SEATS,
      availableSeats: TOTAL_SEATS,

      seatLayout: "vip-2-plus-1",
      seatRows: VIP_ROWS,
      seatColumns: VIP_COLUMNS,

      inventoryType: "date-based",

      updatedAt:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log("========================================");
    console.log("✅ Production VIP seats created");
    console.log(`Trip ID: ${TRIP_ID}`);
    console.log(`Total seats: ${TOTAL_SEATS}`);
    console.log("Layout: VIP 2 + 1");
    console.log("Columns: A B | C");
    console.log("Rows: 10");
    console.log("========================================");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create production seats:");
    console.error(error);
    process.exit(1);
  }
}

seedProductionSeats();