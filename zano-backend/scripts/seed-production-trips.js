// ========================================
// Zano - Production Trips Seeder
// Adds the remaining 7 transport companies
// VIP Jeoun already exists in production
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
// Existing Production Trip
// ========================================

const EXISTING_VIP_TRIP_ID = "Q4manm60DhTFYT5j3gdm";

// ========================================
// New Transport Companies
// VIP Jeoun is intentionally excluded
// because its production trip already exists.
// ========================================

const companies = [
  {
    id: "intercity-stc",
    name: "Intercity STC Coaches",
  },
  {
    id: "vvip-transport",
    name: "VVIP Transport",
  },
  {
    id: "oa-travel-tours",
    name: "OA Travel & Tours",
  },
  {
    id: "sankofa-lines",
    name: "Sankofa Lines",
  },
  {
    id: "metro-mass-transit",
    name: "Metro Mass Transit",
  },
  {
    id: "abc-transport",
    name: "ABC Transport",
  },
  {
    id: "guo-transport",
    name: "GUO Transport",
  },
];

// ========================================
// Daily Operating Days
// ========================================

const operatingDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// ========================================
// Seed Production Trips
// ========================================

async function seedProductionTrips() {
  try {
    // ========================================
    // Confirm Existing VIP Jeoun Trip
    // ========================================

    const vipTripRef = db
      .collection("trips")
      .doc(EXISTING_VIP_TRIP_ID);

    const vipTripSnapshot = await vipTripRef.get();

    if (!vipTripSnapshot.exists) {
      throw new Error(
        `Existing VIP Jeoun trip ${EXISTING_VIP_TRIP_ID} was not found.`
      );
    }

    console.log(
      `✅ Existing VIP Jeoun trip preserved: ${EXISTING_VIP_TRIP_ID}`
    );

    // ========================================
    // Create Remaining Company Trips
    // ========================================

    for (const company of companies) {
      // ========================================
      // Prevent Duplicate Company Trip
      // ========================================

      const existingTripSnapshot = await db
        .collection("trips")
        .where("companyId", "==", company.id)
        .where("routeId", "==", "accra-kumasi")
        .limit(1)
        .get();

      if (!existingTripSnapshot.empty) {
        console.log(
          `⏭️ Skipped: ${company.name} already has an Accra → Kumasi trip`
        );

        continue;
      }

      const tripRef = db.collection("trips").doc();

      // ========================================
      // Trip Data
      // ========================================

      const trip = {
        // Route
        origin: "Accra",
        destination: "Kumasi",
        routeId: "accra-kumasi",

        // Company
        companyId: company.id,
        companyName: company.name,

        // Bus
        busType: "Executive Coach",

        // Recurring Schedule
        scheduleType: "daily",
        operatingDays,

        departureTime: "08:00",
        arrivalTime: "12:30",

        // Booking Window
        bookingEnabled: true,
        bookingWindowDays: 90,

        // Date-specific seat inventory
        inventoryType: "date-based",

        // Fare
        fare: 120,

        // Capacity
        totalSeats: 30,
        availableSeats: 30,

        // Trip Status
        status: "scheduled",

        // Timestamps
        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      };

      await tripRef.set(trip);

      console.log(
        `✅ Created: ${company.name} | Trip ID: ${tripRef.id}`
      );
    }

    // ========================================
    // Complete
    // ========================================

    console.log("========================================");
    console.log("✅ Production trip seeding completed");
    console.log("VIP Jeoun: existing trip preserved");
    console.log(`Additional companies: ${companies.length}`);
    console.log("Total supported companies: 8");
    console.log("Route: Accra → Kumasi");
    console.log("========================================");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create production trips:");
    console.error(error);
    process.exit(1);
  }
}

seedProductionTrips();