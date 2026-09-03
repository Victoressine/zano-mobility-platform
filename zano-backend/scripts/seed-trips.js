/* ========================================
   Firebase Admin
======================================== */

const admin = require("firebase-admin");

/* ========================================
   Connect to Firestore Emulator
======================================== */

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({
  projectId: "zano-969e2",
});

const db = admin.firestore();

/* ========================================
   Seed Trips
======================================== */

async function seedTrips() {
  try {
    const trip = {
      companyId: "vip-jeoun",
      companyName: "VIP Jeoun Transport",

      routeId: "accra-kumasi",

      origin: "Accra",
      destination: "Kumasi",

      departureAt: admin.firestore.Timestamp.fromDate(
        new Date("2026-08-29T08:00:00")
      ),

      arrivalAt: admin.firestore.Timestamp.fromDate(
        new Date("2026-08-29T12:30:00")
      ),

      fare: 120,

      busType: "Executive Coach",

      availableSeats: 17,
      totalSeats: 30,

      status: "scheduled",
    };

    const document = await db.collection("trips").add(trip);

    console.log("========================================");
    console.log("Zano trip created successfully");
    console.log("========================================");
    console.log(`Trip ID: ${document.id}`);
    console.log("Route: Accra → Kumasi");
    console.log("Departure: 29 August 2026, 8:00 AM");
    console.log("Fare: GHS 120");
    console.log("========================================");

    process.exit(0);
  } catch (error) {
    console.error("Failed to seed Zano trip:", error);
    process.exit(1);
  }
}

seedTrips();