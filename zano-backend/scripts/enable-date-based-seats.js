const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({
  projectId: "zano-969e2",
});

const db = admin.firestore();

async function enableDateBasedSeats() {
  // ========================================
  // Existing daily trip schedule
  // ========================================
  const tripId = "Q4manm60DhTFYT5j3gdm";

  const tripRef = db.collection("trips").doc(tripId);
  const tripSnapshot = await tripRef.get();

  if (!tripSnapshot.exists) {
    throw new Error("Trip not found.");
  }

  // ========================================
  // Load the existing seat layout
  // ========================================
  const seatsSnapshot = await db
    .collection("seats")
    .where("tripId", "==", tripId)
    .get();

  if (seatsSnapshot.empty) {
    throw new Error("No seats found for this trip.");
  }

  // ========================================
  // Seats now act as the BUS SEAT TEMPLATE.
  //
  // Their permanent status is no longer used
  // to determine availability for every date.
  // Actual bookings will be checked by:
  //
  // tripId + travelDate + seatId
  // ========================================
  const batch = db.batch();

  seatsSnapshot.docs.forEach((seatDocument) => {
    batch.update(seatDocument.ref, {
      isSeatTemplate: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // ========================================
  // Mark trip as date-based inventory
  // ========================================
  batch.update(tripRef, {
    inventoryType: "date-based",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log("✅ Date-based seat inventory enabled.");
  console.log(`✅ ${seatsSnapshot.size} seat templates updated.`);
  console.log("");
  console.log("Seat availability will now be determined by:");
  console.log("tripId + travelDate + seatId");
}

enableDateBasedSeats()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  });