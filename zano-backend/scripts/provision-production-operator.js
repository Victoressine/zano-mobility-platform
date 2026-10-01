// ========================================
// Zano - Production Operator Provisioning
// Connects an existing Firebase Auth user
// to one approved Zano transport company.
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
// Supported Companies
// ========================================

const supportedCompanies = new Set([
  "intercity-stc",
  "vip-jeoun",
  "vvip-transport",
  "oa-travel-tours",
  "sankofa-lines",
  "metro-mass-transit",
  "abc-transport",
  "guo-transport",
]);

// ========================================
// Command-Line Arguments
//
// Usage:
// node scripts/provision-production-operator.js \
//   <email> <companyId>
// ========================================

const email =
  process.argv[2]?.trim().toLowerCase();

const companyId =
  process.argv[3]?.trim();

// ========================================
// Validate Arguments
// ========================================

if (!email || !companyId) {
  console.error(
    "❌ Usage: node scripts/provision-production-operator.js <email> <companyId>"
  );

  process.exit(1);
}

if (!supportedCompanies.has(companyId)) {
  console.error(
    `❌ Unsupported companyId: ${companyId}`
  );

  console.error(
    `Allowed companies: ${[
      ...supportedCompanies,
    ].join(", ")}`
  );

  process.exit(1);
}

// ========================================
// Provision Operator
// ========================================

async function provisionOperator() {
  try {
    // ========================================
    // Confirm Company Exists
    // ========================================

    const companyRef = db
      .collection("companies")
      .doc(companyId);

    const companySnapshot =
      await companyRef.get();

    if (!companySnapshot.exists) {
      throw new Error(
        `Company ${companyId} does not exist in Firestore.`
      );
    }

    const companyData =
      companySnapshot.data();

    // ========================================
    // Find Existing Firebase Auth User
    // ========================================

    const authUser =
      await admin
        .auth()
        .getUserByEmail(email);

    const uid = authUser.uid;

    // ========================================
    // Protect Existing Passenger Accounts
    // ========================================

    const userRef = db
      .collection("users")
      .doc(uid);

    const userSnapshot =
      await userRef.get();

    if (
      userSnapshot.exists &&
      userSnapshot.data()?.role === "passenger"
    ) {
      throw new Error(
        "This Firebase account is currently a passenger account. Use a dedicated operator account instead."
      );
    }

    // ========================================
    // Prevent Cross-Company Reassignment
    // ========================================

    const memberRef = db
      .collection("operatorMembers")
      .doc(uid);

    const memberSnapshot =
      await memberRef.get();

    if (
      memberSnapshot.exists &&
      memberSnapshot.data()?.companyId !==
        companyId
    ) {
      throw new Error(
        `This operator is already assigned to company ${memberSnapshot.data()?.companyId}.`
      );
    }

    // ========================================
    // Operator User Profile
    // ========================================

    await userRef.set(
      {
        email:
          authUser.email?.toLowerCase() ??
          email,

        firstName: "",
        lastName: "",

        phoneNumber:
          authUser.phoneNumber ?? "",

        role: "operator",
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
    // Operator Membership
    // ========================================

    await memberRef.set(
      {
        userId: uid,
        companyId,

        role: "admin",
        status: "active",

        email:
          authUser.email?.toLowerCase() ??
          email,

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),

        ...(memberSnapshot.exists
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
      "✅ Zano operator provisioned"
    );

    console.log(`UID: ${uid}`);
    console.log(`Email: ${email}`);

    console.log(
      `Company: ${companyData?.name ?? companyId}`
    );

    console.log(`Company ID: ${companyId}`);
    console.log("Role: operator");
    console.log("Membership Role: admin");
    console.log("Status: active");

    console.log(
      "========================================"
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Failed to provision operator:"
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exit(1);
  }
}

provisionOperator();