// ========================================
// Zano - Production Platform Admin
// Provisioning
//
// Connects an existing Firebase Auth user
// to the Zano platform administrator role.
// ========================================

const admin = require(
  "../functions/node_modules/firebase-admin"
);

// ========================================
// Safety Check
// Prevent accidental use with emulator
// ========================================

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ FIRESTORE_EMULATOR_HOST is set. Production provisioning cancelled."
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
// Command-Line Arguments
//
// Usage:
// node scripts/provision-production-admin.js \
//   <email>
// ========================================

const email =
  process.argv[2]?.trim().toLowerCase();

// ========================================
// Validate Arguments
// ========================================

if (!email) {
  console.error(
    "❌ Usage: node scripts/provision-production-admin.js <email>"
  );

  process.exit(1);
}

// ========================================
// Provision Platform Admin
// ========================================

async function provisionAdmin() {
  try {
    // ========================================
    // Find Existing Firebase Auth User
    // ========================================

    const authUser =
      await admin
        .auth()
        .getUserByEmail(email);

    const uid = authUser.uid;

    // ========================================
    // Load Existing Zano User Profile
    // ========================================

    const userRef = db
      .collection("users")
      .doc(uid);

    const userSnapshot =
      await userRef.get();

    const existingRole =
      userSnapshot.exists
        ? userSnapshot.data()?.role
        : undefined;

    // ========================================
    // Protect Existing Passenger Accounts
    // ========================================

    if (existingRole === "passenger") {
      throw new Error(
        "This Firebase account is currently a passenger account. Use a dedicated platform administrator account instead."
      );
    }

    // ========================================
    // Protect Existing Operator Accounts
    // ========================================

    if (existingRole === "operator") {
      throw new Error(
        "This Firebase account is currently an operator account. Use a dedicated platform administrator account instead."
      );
    }

    // ========================================
    // Protect Unknown Existing Roles
    // ========================================

    if (
      existingRole &&
      existingRole !== "admin"
    ) {
      throw new Error(
        `This Firebase account already has the unsupported role "${existingRole}".`
      );
    }

    // ========================================
    // Prevent Operator Membership Conflict
    // ========================================

    const memberSnapshot =
      await db
        .collection("operatorMembers")
        .doc(uid)
        .get();

    if (memberSnapshot.exists) {
      throw new Error(
        "This Firebase account already has an operator membership. Use a dedicated platform administrator account instead."
      );
    }

    // ========================================
    // Platform Admin User Profile
    // ========================================

    await userRef.set(
      {
        email:
          authUser.email?.toLowerCase() ??
          email,

        firstName:
          userSnapshot.exists
            ? userSnapshot.data()?.firstName ?? ""
            : "",

        lastName:
          userSnapshot.exists
            ? userSnapshot.data()?.lastName ?? ""
            : "",

        phoneNumber:
          authUser.phoneNumber ?? "",

        role: "admin",

        authProvider: "password",

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),

        ...(userSnapshot.exists
          ? {}
          : {
              createdAt:
                admin.firestore.FieldValue.serverTimestamp(),
            }),
      },
      {
        merge: true,
      }
    );

    // ========================================
    // Success
    // ========================================

    console.log(
      "========================================"
    );

    console.log(
      "✅ Zano platform administrator provisioned"
    );

    console.log(`UID: ${uid}`);
    console.log(
      `Email: ${
        authUser.email?.toLowerCase() ??
        email
      }`
    );

    console.log("Role: admin");

    console.log(
      "========================================"
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Failed to provision platform administrator:"
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exit(1);
  }
}

// ========================================
// Run
// ========================================

provisionAdmin();