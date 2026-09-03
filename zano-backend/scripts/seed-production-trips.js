// ========================================
// Zano - Production Trip Seeder
// ========================================

const admin = require("../functions/node_modules/firebase-admin");

// ========================================
// Safety Check
// Prevent accidental use with emulator
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
// Seed Production Trip
// ========================================

async function seedProductionTrip() {
  try {
    const tripRef = db.collection("trips").doc();

    const trip = {
      origin: "Accra",
      destination: "Kumasi",

      routeId: "accra-kumasi",

      companyId: "vip-jeoun",
      companyName: "VIP Jeoun Transport",

      busType: "Executive Coach",

      departureAt: admin.firestore.Timestamp.fromDate(
        new Date("2026-08-29T08:00:00Z")
      ),

      arrivalAt: admin.firestore.Timestamp.fromDate(
        new Date("2026-08-29T12:30:00Z")
      ),

      fare: 120,

      totalSeats: 30,
      availableSeats: 17,

      status: "scheduled",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await tripRef.set(trip);

    console.log("========================================");
    console.log("✅ Production trip created successfully");
    console.log(`Trip ID: ${tripRef.id}`);
    console.log("Route: Accra → Kumasi");
    console.log("Fare: GHS 120");
    console.log("========================================");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create production trip:");
    console.error(error);
    process.exit(1);
  }
}

seedProductionTrip();
