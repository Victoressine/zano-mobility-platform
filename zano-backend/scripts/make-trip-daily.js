const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({
  projectId: "zano-969e2",
});

const db = admin.firestore();

async function makeTripDaily() {
  // ========================================
  // Existing Accra → Kumasi trip
  // ========================================
  const tripId = "Q4manm60DhTFYT5j3gdm";

  // ========================================
  // Convert trip into a recurring schedule
  // ========================================
  await db.collection("trips").doc(tripId).update({
    scheduleType: "daily",

    operatingDays: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ],

    departureTime: "08:00",
    arrivalTime: "12:30",

    bookingEnabled: true,

    bookingWindowDays: 90,

    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("✅ Trip converted to a daily schedule.");
  console.log("Passengers can book this route every day.");
}

makeTripDaily()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  });