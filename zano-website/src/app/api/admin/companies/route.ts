// ========================================
// Zano - Admin Companies API
// Secure company management
// ========================================

import "server-only";

import {
  FieldValue,
  type DocumentData,
} from "firebase-admin/firestore";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

// ========================================
// Types
// ========================================

type CompanyStatus =
  | "active"
  | "inactive";

type CreateCompanyBody = {
  name?: unknown;
  companyId?: unknown;
  email?: unknown;
  phoneNumber?: unknown;
  address?: unknown;
  status?: unknown;
};

type UpdateCompanyBody = {
  companyId?: unknown;
  name?: unknown;
  email?: unknown;
  phoneNumber?: unknown;
  address?: unknown;
  status?: unknown;
};

// ========================================
// GET /api/admin/companies
// ========================================

export async function GET(
  request: NextRequest,
) {
  try {
    const authorization =
      await requireAdmin(request);

    if (!authorization.ok) {
      return authorization.response;
    }

    // ========================================
    // Load Company Related Collections
    // ========================================

    const [
      companiesSnapshot,
      operatorMembersSnapshot,
      vehiclesSnapshot,
      tripsSnapshot,
      bookingsSnapshot,
    ] = await Promise.all([
      adminDb
        .collection("companies")
        .get(),

      adminDb
        .collection("operatorMembers")
        .get(),

      adminDb
        .collection("vehicles")
        .get(),

      adminDb
        .collection("trips")
        .get(),

      adminDb
        .collection("bookings")
        .get(),
    ]);

    // ========================================
    // Build Company Statistics
    // ========================================

    const operatorCounts =
      new Map<string, number>();

    const activeOperatorCounts =
      new Map<string, number>();

    for (
      const document of
      operatorMembersSnapshot.docs
    ) {
      const data = document.data();

      const companyId =
        stringOrEmpty(
          data.companyId,
        );

      if (!companyId) {
        continue;
      }

      incrementMap(
        operatorCounts,
        companyId,
      );

      if (
        normalizeStatus(
          data.status,
        ) === "active"
      ) {
        incrementMap(
          activeOperatorCounts,
          companyId,
        );
      }
    }

    const vehicleCounts =
      new Map<string, number>();

    const activeVehicleCounts =
      new Map<string, number>();

    for (
      const document of
      vehiclesSnapshot.docs
    ) {
      const data = document.data();

      const companyId =
        stringOrEmpty(
          data.companyId,
        );

      if (!companyId) {
        continue;
      }

      incrementMap(
        vehicleCounts,
        companyId,
      );

      if (
        normalizeStatus(
          data.status,
        ) === "active"
      ) {
        incrementMap(
          activeVehicleCounts,
          companyId,
        );
      }
    }

    const tripCounts =
      new Map<string, number>();

    for (
      const document of
      tripsSnapshot.docs
    ) {
      const companyId =
        stringOrEmpty(
          document.data().companyId,
        );

      if (companyId) {
        incrementMap(
          tripCounts,
          companyId,
        );
      }
    }

    const bookingCounts =
      new Map<string, number>();

    const revenueTotals =
      new Map<string, number>();

    for (
      const document of
      bookingsSnapshot.docs
    ) {
      const data = document.data();

      const companyId =
        stringOrEmpty(
          data.companyId,
        );

      if (!companyId) {
        continue;
      }

      incrementMap(
        bookingCounts,
        companyId,
      );

      // Revenue only counts successful,
      // confirmed bookings.
      if (
        data.status === "confirmed" &&
        data.paymentStatus ===
          "successful"
      ) {
        incrementNumberMap(
          revenueTotals,
          companyId,
          numberOrZero(
            data.totalAmount,
          ),
        );
      }
    }

    // ========================================
    // Sanitize Companies
    // ========================================

    const companies =
      companiesSnapshot.docs
        .map((document) =>
          sanitizeCompany(
            document.id,
            document.data(),
            {
              operators:
                operatorCounts.get(
                  document.id,
                ) ?? 0,

              activeOperators:
                activeOperatorCounts.get(
                  document.id,
                ) ?? 0,

              vehicles:
                vehicleCounts.get(
                  document.id,
                ) ?? 0,

              activeVehicles:
                activeVehicleCounts.get(
                  document.id,
                ) ?? 0,

              trips:
                tripCounts.get(
                  document.id,
                ) ?? 0,

              bookings:
                bookingCounts.get(
                  document.id,
                ) ?? 0,

              revenue:
                revenueTotals.get(
                  document.id,
                ) ?? 0,
            },
          ),
        )
        .sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "en",
            {
              sensitivity: "base",
            },
          ),
        );

    // ========================================
    // Return Companies
    // ========================================

    return successResponse({
      companies,

      summary: {
        total: companies.length,

        active:
          companies.filter(
            (company) =>
              company.status ===
              "active",
          ).length,

        inactive:
          companies.filter(
            (company) =>
              company.status ===
              "inactive",
          ).length,
      },

      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Admin companies GET error:",
      error,
    );

    return errorResponse(
      "Unable to load companies.",
      500,
    );
  }
}

// ========================================
// POST /api/admin/companies
// Create Company
// ========================================

export async function POST(
  request: NextRequest,
) {
  try {
    const authorization =
      await requireAdmin(request);

    if (!authorization.ok) {
      return authorization.response;
    }

    const body =
      (await readJson(
        request,
      )) as CreateCompanyBody | null;

    if (!body) {
      return errorResponse(
        "Invalid request body.",
        400,
      );
    }

    // ========================================
    // Validate Company
    // ========================================

    const name =
      cleanString(
        body.name,
      );

    if (name.length < 2) {
      return errorResponse(
        "Company name is required.",
        400,
      );
    }

    if (name.length > 120) {
      return errorResponse(
        "Company name must be 120 characters or fewer.",
        400,
      );
    }

    const requestedCompanyId =
      cleanString(
        body.companyId,
      );

    const companyId =
      requestedCompanyId
        ? slugifyCompanyId(
            requestedCompanyId,
          )
        : slugifyCompanyId(name);

    if (!companyId) {
      return errorResponse(
        "A valid company ID could not be generated.",
        400,
      );
    }

    if (
      companyId.length > 80
    ) {
      return errorResponse(
        "Company ID is too long.",
        400,
      );
    }

    const email =
      normalizeEmail(
        body.email,
      );

    if (
      email &&
      !isValidEmail(email)
    ) {
      return errorResponse(
        "Enter a valid company email address.",
        400,
      );
    }

    const phoneNumber =
      cleanString(
        body.phoneNumber,
      );

    const address =
      cleanString(
        body.address,
      );

    const status =
      parseCompanyStatus(
        body.status,
        "active",
      );

    if (!status) {
      return errorResponse(
        "Company status must be active or inactive.",
        400,
      );
    }

    // ========================================
    // Prevent Duplicate ID
    // ========================================

    const companyRef =
      adminDb
        .collection("companies")
        .doc(companyId);

    const existingCompany =
      await companyRef.get();

    if (
      existingCompany.exists
    ) {
      return errorResponse(
        "A company with this company ID already exists.",
        409,
      );
    }

    // ========================================
    // Prevent Duplicate Name
    // ========================================

    const companiesSnapshot =
      await adminDb
        .collection("companies")
        .get();

    const duplicateName =
      companiesSnapshot.docs.some(
        (document) =>
          cleanString(
            document.data().name,
          ).toLowerCase() ===
          name.toLowerCase(),
      );

    if (duplicateName) {
      return errorResponse(
        "A company with this name already exists.",
        409,
      );
    }

    // ========================================
    // Create Company
    // ========================================

    await companyRef.set({
      name,
      email,
      phoneNumber,
      address,
      status,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),

      createdBy:
        authorization.userId,
    });

    const createdSnapshot =
      await companyRef.get();

    return successResponse(
      {
        company:
          sanitizeCompany(
            createdSnapshot.id,
            createdSnapshot.data() ??
              {},
            {
              operators: 0,
              activeOperators: 0,
              vehicles: 0,
              activeVehicles: 0,
              trips: 0,
              bookings: 0,
              revenue: 0,
            },
          ),
      },
      201,
    );
  } catch (error) {
    console.error(
      "Admin companies POST error:",
      error,
    );

    return errorResponse(
      "Unable to create company.",
      500,
    );
  }
}

// ========================================
// PATCH /api/admin/companies
// Update Company
// ========================================

export async function PATCH(
  request: NextRequest,
) {
  try {
    const authorization =
      await requireAdmin(request);

    if (!authorization.ok) {
      return authorization.response;
    }

    const body =
      (await readJson(
        request,
      )) as UpdateCompanyBody | null;

    if (!body) {
      return errorResponse(
        "Invalid request body.",
        400,
      );
    }

    const companyId =
      cleanString(
        body.companyId,
      );

    if (!companyId) {
      return errorResponse(
        "Company ID is required.",
        400,
      );
    }

    const companyRef =
      adminDb
        .collection("companies")
        .doc(companyId);

    const companySnapshot =
      await companyRef.get();

    if (
      !companySnapshot.exists
    ) {
      return errorResponse(
        "Company was not found.",
        404,
      );
    }

    // ========================================
    // Build Safe Update
    // ========================================

    const updates:
      Record<string, unknown> = {
        updatedAt:
          FieldValue.serverTimestamp(),

        updatedBy:
          authorization.userId,
      };

    if (
      body.name !== undefined
    ) {
      const name =
        cleanString(
          body.name,
        );

      if (
        name.length < 2 ||
        name.length > 120
      ) {
        return errorResponse(
          "Company name must be between 2 and 120 characters.",
          400,
        );
      }

      const companiesSnapshot =
        await adminDb
          .collection("companies")
          .get();

      const duplicateName =
        companiesSnapshot.docs.some(
          (document) =>
            document.id !==
              companyId &&
            cleanString(
              document.data().name,
            ).toLowerCase() ===
              name.toLowerCase(),
        );

      if (duplicateName) {
        return errorResponse(
          "Another company already uses this name.",
          409,
        );
      }

      updates.name = name;
    }

    if (
      body.email !== undefined
    ) {
      const email =
        normalizeEmail(
          body.email,
        );

      if (
        email &&
        !isValidEmail(email)
      ) {
        return errorResponse(
          "Enter a valid company email address.",
          400,
        );
      }

      updates.email = email;
    }

    if (
      body.phoneNumber !==
      undefined
    ) {
      updates.phoneNumber =
        cleanString(
          body.phoneNumber,
        );
    }

    if (
      body.address !== undefined
    ) {
      updates.address =
        cleanString(
          body.address,
        );
    }

    if (
      body.status !== undefined
    ) {
      const status =
        parseCompanyStatus(
          body.status,
        );

      if (!status) {
        return errorResponse(
          "Company status must be active or inactive.",
          400,
        );
      }

      updates.status = status;
    }

    // ========================================
    // Update Company
    // ========================================

    await companyRef.set(
      updates,
      {
        merge: true,
      },
    );

    const updatedSnapshot =
      await companyRef.get();

    return successResponse({
      company:
        sanitizeCompany(
          updatedSnapshot.id,
          updatedSnapshot.data() ??
            {},
          {
            operators: 0,
            activeOperators: 0,
            vehicles: 0,
            activeVehicles: 0,
            trips: 0,
            bookings: 0,
            revenue: 0,
          },
        ),
    });
  } catch (error) {
    console.error(
      "Admin companies PATCH error:",
      error,
    );

    return errorResponse(
      "Unable to update company.",
      500,
    );
  }
}

// ========================================
// Admin Authorization
// ========================================

async function requireAdmin(
  request: NextRequest,
): Promise<
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const authorization =
    request.headers.get(
      "authorization",
    );

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "Authentication is required.",
          401,
        ),
    };
  }

  const idToken =
    authorization
      .slice(7)
      .trim();

  if (!idToken) {
    return {
      ok: false,

      response:
        errorResponse(
          "Authentication token is missing.",
          401,
        ),
    };
  }

  let decodedToken;

  try {
    decodedToken =
      await adminAuth.verifyIdToken(
        idToken,
      );
  } catch {
    return {
      ok: false,

      response:
        errorResponse(
          "Your session is invalid or has expired.",
          401,
        ),
    };
  }

  const userId =
    decodedToken.uid;

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(userId)
      .get();

  if (
    !userSnapshot.exists ||
    userSnapshot.data()?.role !==
      "admin"
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "Administrator access is required.",
          403,
        ),
    };
  }

  return {
    ok: true,
    userId,
  };
}

// ========================================
// Company Sanitizer
// ========================================

function sanitizeCompany(
  id: string,
  data: DocumentData,
  counts: {
    operators: number;
    activeOperators: number;
    vehicles: number;
    activeVehicles: number;
    trips: number;
    bookings: number;
    revenue: number;
  },
) {
  return {
    id,

    name:
      cleanString(
        data.name,
      ) || id,

    email:
      cleanString(
        data.email,
      ),

    phoneNumber:
      cleanString(
        data.phoneNumber ??
          data.phone,
      ),

    address:
      cleanString(
        data.address,
      ),

    status:
      normalizeStatus(
        data.status,
      ),

    operators:
      counts.operators,

    activeOperators:
      counts.activeOperators,

    vehicles:
      counts.vehicles,

    activeVehicles:
      counts.activeVehicles,

    trips:
      counts.trips,

    bookings:
      counts.bookings,

    revenue:
      counts.revenue,

    createdAt:
      timestampToIso(
        data.createdAt,
      ),

    updatedAt:
      timestampToIso(
        data.updatedAt,
      ),
  };
}

// ========================================
// Status Helpers
// ========================================

function normalizeStatus(
  value: unknown,
): CompanyStatus {
  const status =
    cleanString(
      value,
    ).toLowerCase();

  // Existing company documents without
  // a status are treated as active for
  // backward compatibility.
  if (
    !status ||
    status === "active"
  ) {
    return "active";
  }

  return "inactive";
}

function parseCompanyStatus(
  value: unknown,
  fallback?: CompanyStatus,
): CompanyStatus | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback ?? null;
  }

  const status =
    cleanString(
      value,
    ).toLowerCase();

  if (
    status === "active" ||
    status === "inactive"
  ) {
    return status;
  }

  return null;
}

// ========================================
// General Helpers
// ========================================

function cleanString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function stringOrEmpty(
  value: unknown,
): string {
  return cleanString(value);
}

function normalizeEmail(
  value: unknown,
): string {
  return cleanString(
    value,
  ).toLowerCase();
}

function isValidEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function numberOrZero(
  value: unknown,
): number {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function slugifyCompanyId(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function incrementMap(
  map: Map<string, number>,
  key: string,
) {
  map.set(
    key,
    (map.get(key) ?? 0) + 1,
  );
}

function incrementNumberMap(
  map: Map<string, number>,
  key: string,
  amount: number,
) {
  map.set(
    key,
    (map.get(key) ?? 0) +
      amount,
  );
}

// ========================================
// Timestamp Helper
// ========================================

function timestampToIso(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    )
      .toDate()
      .toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  return null;
}

// ========================================
// JSON Helper
// ========================================

async function readJson(
  request: NextRequest,
): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ========================================
// Responses
// ========================================

function successResponse(
  data: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(
    {
      success: true,
      ...data,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    },
  );
}

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    },
  );
}