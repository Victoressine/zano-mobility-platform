"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type Company = {
  id: string;
  name: string;
};

type OperatorMembership = {
  userId: string;
  companyId: string;
  role: string;
  status: string;
};

type Trip = {
  id: string;
  companyId: string;
  companyName?: string;
  origin: string;
  destination: string;
  busType?: string;
  departureTime?: string;
  arrivalTime?: string;
  fare?: number;
  totalSeats?: number;
  availableSeats?: number;
  status?: string;
};

type BookingPassenger = {
  fullName?: string;
  phoneNumber?: string;
  seatId?: string;
  seatNumber?: string;
};

type Booking = {
  id: string;

  bookingReference?: string;

  userId?: string;
  tripId?: string;

  companyId?: string;
  companyName?: string;

  routeId?: string;
  origin?: string;
  destination?: string;
  busType?: string;

  travelDate?: string;

  passengerCount?: number;
  passengers?: BookingPassenger[];

  seatIds?: string[];
  seatNumbers?: string[];

  fare?: number;
  subtotal?: number;
  bookingFee?: number;
  totalAmount?: number;

  currency?: string;

  status?: string;
  paymentStatus?: string;

  contactEmail?: string;
  contactPhone?: string;

  createdAt?: unknown;
};

type OperatorReportsResponse = {
  success: boolean;

  company?: Company;

  trips?: Trip[];

  bookings?: Booking[];

  generatedAt?: string;

  error?: string;
};

// ========================================
// Date Helpers
// ========================================

function getTodayDateKey() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    now.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function changeDate(
  dateKey: string,
  days: number,
) {
  const date = new Date(
    `${dateKey}T00:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return dateKey;
  }

  date.setDate(
    date.getDate() + days,
  );

  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getBookingDate(
  value: unknown,
): Date | null {
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
    ).toDate();
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      new Date(value);

    return Number.isNaN(
      parsed.getTime(),
    )
      ? null
      : parsed;
  }

  return null;
}

function formatSelectedDate(
  value: string,
) {
  const date = new Date(
    `${value}T00:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GH",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );
}

function formatBookingTime(
  value: unknown,
) {
  const date =
    getBookingDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleTimeString(
    "en-GH",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

// ========================================
// Booking Helpers
// ========================================

function getBookingAmount(
  booking: Booking,
) {
  const amount =
    booking.totalAmount ??
    booking.subtotal ??
    booking.fare ??
    0;

  const numericAmount =
    Number(amount);

  return Number.isFinite(
    numericAmount,
  )
    ? numericAmount
    : 0;
}

function getPassengerCount(
  booking: Booking,
) {
  const storedCount =
    Number(
      booking.passengerCount ??
        0,
    );

  if (
    Number.isFinite(
      storedCount,
    ) &&
    storedCount > 0
  ) {
    return storedCount;
  }

  if (
    Array.isArray(
      booking.passengers,
    )
  ) {
    return booking.passengers.length;
  }

  return 0;
}

function getSeatCount(
  booking: Booking,
) {
  if (
    Array.isArray(
      booking.seatNumbers,
    ) &&
    booking.seatNumbers.length >
      0
  ) {
    return booking.seatNumbers.length;
  }

  return getPassengerCount(
    booking,
  );
}

function getPassengerNames(
  booking: Booking,
) {
  const names =
    booking.passengers
      ?.map((passenger) =>
        passenger.fullName?.trim(),
      )
      .filter(
        (
          name,
        ): name is string =>
          Boolean(name),
      ) ?? [];

  if (names.length > 0) {
    return names.join(", ");
  }

  return (
    booking.contactEmail ??
    "Passenger"
  );
}

function getStatusClasses(
  status?: string,
) {
  switch (
    status?.toLowerCase()
  ) {
    case "confirmed":
      return "bg-green-50 text-green-700";

    case "cancelled":
      return "bg-red-50 text-red-700";

    case "completed":
      return "bg-blue-50 text-blue-700";

    case "pending":
      return "bg-amber-50 text-amber-700";

    default:
      return "bg-[#f8f7ff] text-[#002451]";
  }
}

// ========================================
// Dashboard Page
// ========================================

export default function OperatorDashboardPage() {
  const router =
    useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<User | null>(
      null,
    );

  const [
    membership,
    setMembership,
  ] =
    useState<OperatorMembership | null>(
      null,
    );

  const [
    company,
    setCompany,
  ] =
    useState<Company | null>(
      null,
    );

  const [
    trips,
    setTrips,
  ] =
    useState<Trip[]>([]);

  const [
    bookings,
    setBookings,
  ] =
    useState<Booking[]>([]);

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState(
      getTodayDateKey,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  // ========================================
  // Authentication + Secure Reports
  // ========================================

  useEffect(() => {
    let cancelled = false;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          // ========================================
          // Require Authentication
          // ========================================

          if (!user) {
            if (!cancelled) {
              setLoading(false);
            }

            router.replace(
              "/operator/login",
            );

            return;
          }

          try {
            if (!cancelled) {
              setLoading(true);
              setError("");
            }

            // ========================================
            // Verify Operator User Profile
            // ========================================

            const userSnapshot =
              await getDoc(
                doc(
                  db,
                  "users",
                  user.uid,
                ),
              );

            if (
              !userSnapshot.exists() ||
              userSnapshot.data()
                .role !==
                "operator"
            ) {
              await signOut(auth);

              router.replace(
                "/operator/login",
              );

              return;
            }

            // ========================================
            // Verify Operator Membership
            // ========================================

            const membershipSnapshot =
              await getDoc(
                doc(
                  db,
                  "operatorMembers",
                  user.uid,
                ),
              );

            if (
              !membershipSnapshot.exists()
            ) {
              await signOut(auth);

              router.replace(
                "/operator/login",
              );

              return;
            }

            const membershipData =
              membershipSnapshot.data() as
                OperatorMembership;

            if (
              membershipData.userId !==
                user.uid ||
              membershipData.status !==
                "active" ||
              !membershipData.companyId
            ) {
              await signOut(auth);

              router.replace(
                "/operator/login",
              );

              return;
            }

            // ========================================
            // Firebase ID Token
            // ========================================

            const idToken =
              await user.getIdToken();

            // ========================================
            // Secure Server Report
            //
            // Do NOT query passenger bookings
            // directly from client Firestore.
            // ========================================

            const response =
              await fetch(
                "/api/operator/reports",
                {
                  method: "GET",

                  headers: {
                    Authorization:
                      `Bearer ${idToken}`,
                  },

                  cache:
                    "no-store",
                },
              );

            let report:
              OperatorReportsResponse;

            try {
              report =
                (await response.json()) as
                  OperatorReportsResponse;
            } catch {
              throw new Error(
                "The operator reporting service returned an invalid response.",
              );
            }

            if (
              !response.ok ||
              !report.success
            ) {
              throw new Error(
                report.error ||
                  "Unable to load operator reports.",
              );
            }

            if (
              !report.company
            ) {
              throw new Error(
                "Your assigned transport company could not be loaded.",
              );
            }

            // ========================================
            // Client-Side Consistency Check
            // ========================================

            if (
              report.company.id !==
              membershipData.companyId
            ) {
              throw new Error(
                "Operator company verification failed.",
              );
            }

            if (cancelled) {
              return;
            }

            // ========================================
            // Store Dashboard Data
            // ========================================

            setCurrentUser(
              user,
            );

            setMembership(
              membershipData,
            );

            setCompany(
              report.company,
            );

            setTrips(
              Array.isArray(
                report.trips,
              )
                ? report.trips
                : [],
            );

            setBookings(
              Array.isArray(
                report.bookings,
              )
                ? report.bookings
                : [],
            );
          } catch (
            loadError
          ) {
            console.error(
              "Operator dashboard load error:",
              loadError,
            );

            if (!cancelled) {
              setCurrentUser(
                user,
              );

              setError(
                loadError instanceof
                  Error
                  ? loadError.message
                  : "Unable to load your operator dashboard.",
              );
            }
          } finally {
            if (!cancelled) {
              setLoading(
                false,
              );
            }
          }
        },
      );

    return () => {
      cancelled = true;

      unsubscribe();
    };
  }, [router]);

  // ========================================
  // Selected Travel Date Bookings
  // ========================================

  const selectedDateBookings =
    useMemo(() => {
      return bookings.filter(
        (booking) =>
          booking.travelDate ===
          selectedDate,
      );
    }, [
      bookings,
      selectedDate,
    ]);

  // ========================================
  // Calendar Statistics
  // ========================================

  const statistics =
    useMemo(() => {
      const confirmedBookings =
        selectedDateBookings.filter(
          (booking) =>
            booking.status ===
              "confirmed" &&
            booking.paymentStatus ===
              "successful",
        );

      const cancelledBookings =
        selectedDateBookings.filter(
          (booking) =>
            booking.status ===
            "cancelled",
        );

      const pendingBookings =
        selectedDateBookings.filter(
          (booking) =>
            booking.status ===
              "pending" ||
            booking.paymentStatus ===
              "pending",
        );

      const completedBookings =
        selectedDateBookings.filter(
          (booking) =>
            booking.status ===
            "completed",
        );

      const passengers =
        confirmedBookings.reduce(
          (
            total,
            booking,
          ) =>
            total +
            getPassengerCount(
              booking,
            ),
          0,
        );

      const seatsBooked =
        confirmedBookings.reduce(
          (
            total,
            booking,
          ) =>
            total +
            getSeatCount(
              booking,
            ),
          0,
        );

      const revenue =
        confirmedBookings.reduce(
          (
            total,
            booking,
          ) =>
            total +
            getBookingAmount(
              booking,
            ),
          0,
        );

      return {
        bookings:
          confirmedBookings.length,

        passengers,

        seatsBooked,

        revenue,

        confirmed:
          confirmedBookings.length,

        pending:
          pendingBookings.length,

        cancelled:
          cancelledBookings.length,

        completed:
          completedBookings.length,
      };
    }, [
      selectedDateBookings,
    ]);

  // ========================================
  // Selected Date Booking Records
  // ========================================

  const bookingRecords =
    useMemo(() => {
      return [
        ...selectedDateBookings,
      ].sort((a, b) => {
        const aDate =
          getBookingDate(
            a.createdAt,
          );

        const bDate =
          getBookingDate(
            b.createdAt,
          );

        return (
          (bDate?.getTime() ??
            0) -
          (aDate?.getTime() ??
            0)
        );
      });
    }, [
      selectedDateBookings,
    ]);

  // ========================================
  // Sign Out
  // ========================================

  async function handleSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace(
        "/operator/login",
      );
    }
  }

  // ========================================
  // Loading
  // ========================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f7ff]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

          <p className="mt-4 font-bold text-[#002451]">
            Loading operator
            dashboard...
          </p>
        </div>
      </main>
    );
  }

  // ========================================
  // Error
  // ========================================

  if (
    error ||
    !company ||
    !membership
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f7ff] px-5">
        <div className="w-full max-w-md rounded-3xl border border-[#c8cad4]/50 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl font-black text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-black text-[#002451]">
            Dashboard unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#747680]">
            {error ||
              "Your company dashboard could not be loaded."}
          </p>

          <button
            type="button"
            onClick={
              handleSignOut
            }
            className="mt-6 w-full rounded-xl bg-[#002451] px-5 py-3 text-sm font-black text-white transition hover:bg-[#003b80]"
          >
            Return to operator
            login
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // Dashboard
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-screen">
        {/* ========================================
            Desktop Navigation
        ======================================== */}

        <aside className="hidden w-72 shrink-0 bg-[#002451] px-6 py-8 text-white lg:block">
          <Link
            href="/"
            className="text-3xl font-black"
          >
            Zano
          </Link>

          <div className="mt-8 rounded-2xl bg-white/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#39b5f4]">
              Transport Company
            </p>

            <h2 className="mt-2 text-lg font-black">
              {company.name}
            </h2>
          </div>

          <nav className="mt-8 space-y-2">
            <Link
              href="/operator/dashboard"
              className="block rounded-xl bg-[#ff7417] px-4 py-3 text-sm font-bold text-white"
            >
              Overview
            </Link>

            <Link
              href="/operator/trips"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Manage Trips
            </Link>
          </nav>
        </aside>

        {/* ========================================
            Main Content
        ======================================== */}

        <section className="min-w-0 flex-1">
          {/* ========================================
              Header
          ======================================== */}

          <header className="border-b border-[#c8cad4]/60 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#747680]">
                  Operator Overview
                </p>

                <h1 className="text-2xl font-black text-[#002451]">
                  {company.name}
                </h1>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-bold text-[#002451]">
                    {currentUser?.email}
                  </p>

                  <p className="text-xs capitalize text-[#747680]">
                    {membership.role}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleSignOut
                  }
                  className="rounded-xl border border-[#c8cad4] px-4 py-2.5 text-sm font-bold text-[#002451] transition hover:bg-[#f8f7ff]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          {/* ========================================
              Mobile Navigation
          ======================================== */}

          <div className="border-b border-[#c8cad4]/60 bg-white px-5 py-3 lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-2">
              <Link
                href="/operator/dashboard"
                className="rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white"
              >
                Overview
              </Link>

              <Link
                href="/operator/trips"
                className="rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#002451]"
              >
                Manage Trips
              </Link>
            </div>
          </div>

          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
            {/* ========================================
                Hero
            ======================================== */}

<section className="overflow-hidden rounded-3xl bg-[#002451] text-white">
  <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
    {/* ========================================
        Company Overview Content
    ======================================== */}

    <div className="p-7 sm:p-9">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#39b5f4]">
        Company Overview
      </p>

      <h2 className="mt-3 text-3xl font-black">
        {company.name}
      </h2>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
        Monitor passenger bookings,
        travellers, seats and revenue using
        the operational travel calendar.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/operator/trips"
          className="inline-flex rounded-xl bg-[#ff7417] px-5 py-3 text-sm font-black text-white transition hover:bg-[#e96308]"
        >
          Manage Trips
        </Link>

        <button
          type="button"
          onClick={() =>
            setSelectedDate(
              getTodayDateKey(),
            )
          }
          className="rounded-xl border border-white/20 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
        >
          View Today
        </button>
      </div>
    </div>

    {/* ========================================
        Local Downloaded Bus Image
    ======================================== */}

    <div className="relative min-h-[260px] lg:min-h-full">
      <Image
        src="/images/dashboard/zano bus 1.jpg"
        alt={`${company.name} bus`}
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 40vw"
        className="object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-[#002451]/40 to-transparent lg:from-[#002451]/25" />
    </div>
  </div>
</section>

            {/* ========================================
                Calendar Controls
            ======================================== */}

            <section className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-sm font-bold text-[#747680]">
                    Daily Operations
                    Report
                  </p>

                  <h2 className="mt-1 text-2xl font-black text-[#002451]">
                    Overview by Travel
                    Date
                  </h2>
                </div>

                <div className="w-full sm:w-auto">
                  <label
                    htmlFor="report-date"
                    className="mb-2 block text-xs font-black uppercase tracking-wider text-[#747680]"
                  >
                    Select Travel Date
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous day"
                      onClick={() =>
                        setSelectedDate(
                          (
                            currentDate,
                          ) =>
                            changeDate(
                              currentDate,
                              -1,
                            ),
                        )
                      }
                      className="rounded-xl border border-[#c8cad4] bg-white px-4 py-3 font-black text-[#002451] transition hover:border-[#39b5f4]"
                    >
                      ←
                    </button>

                    <input
                      id="report-date"
                      type="date"
                      value={
                        selectedDate
                      }
                      onChange={(
                        event,
                      ) => {
                        if (
                          event.target
                            .value
                        ) {
                          setSelectedDate(
                            event.target
                              .value,
                          );
                        }
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-[#c8cad4] bg-white px-4 py-3 font-bold text-[#002451] outline-none transition focus:border-[#39b5f4] sm:flex-none"
                    />

                    <button
                      type="button"
                      aria-label="Next day"
                      onClick={() =>
                        setSelectedDate(
                          (
                            currentDate,
                          ) =>
                            changeDate(
                              currentDate,
                              1,
                            ),
                        )
                      }
                      className="rounded-xl border border-[#c8cad4] bg-white px-4 py-3 font-black text-[#002451] transition hover:border-[#39b5f4]"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>

              {/* ========================================
                  Selected Date
              ======================================== */}

              <div className="mt-5 rounded-2xl border border-[#39b5f4]/20 bg-[#39b5f4]/10 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-wider text-[#747680]">
                  Showing travel
                  records for
                </p>

                <p className="mt-1 text-lg font-black text-[#002451]">
                  {formatSelectedDate(
                    selectedDate,
                  )}
                </p>
              </div>

              {/* ========================================
                  Primary Statistics
              ======================================== */}

              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard
                  label="Bookings"
                  value={String(
                    statistics.bookings,
                  )}
                  description="Confirmed bookings"
                />

                <DashboardCard
                  label="Passengers"
                  value={String(
                    statistics.passengers,
                  )}
                  description="Confirmed travellers"
                />

                <DashboardCard
                  label="Seats Booked"
                  value={String(
                    statistics.seatsBooked,
                  )}
                  description="Confirmed seats"
                />

                <DashboardCard
                  label="Revenue"
                  value={`GH₵${statistics.revenue.toFixed(
                    2,
                  )}`}
                  description="Successful confirmed payments"
                />
              </div>

              {/* ========================================
                  Status Statistics
              ======================================== */}

              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard
                  label="Confirmed"
                  value={String(
                    statistics.confirmed,
                  )}
                />

                <DashboardCard
                  label="Pending"
                  value={String(
                    statistics.pending,
                  )}
                />

                <DashboardCard
                  label="Completed"
                  value={String(
                    statistics.completed,
                  )}
                />

                <DashboardCard
                  label="Cancelled"
                  value={String(
                    statistics.cancelled,
                  )}
                />
              </div>
            </section>

            {/* ========================================
                Booking Records
            ======================================== */}

            <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#002451]">
                    Booking Records
                  </h2>

                  <p className="mt-1 text-sm text-[#747680]">
                    Passenger bookings
                    travelling on{" "}
                    {formatSelectedDate(
                      selectedDate,
                    )}
                    .
                  </p>
                </div>

                <div className="rounded-xl bg-[#f8f7ff] px-4 py-2 text-sm font-black text-[#002451]">
                  {bookingRecords.length}{" "}
                  record
                  {bookingRecords.length ===
                  1
                    ? ""
                    : "s"}
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left">
                  <thead>
                    <tr className="border-b border-[#c8cad4]/70 text-xs uppercase tracking-wider text-[#747680]">
                      <th className="px-3 py-4">
                        Reference
                      </th>

                      <th className="px-3 py-4">
                        Passenger
                      </th>

                      <th className="px-3 py-4">
                        Route
                      </th>

                      <th className="px-3 py-4">
                        Bus
                      </th>

                      <th className="px-3 py-4">
                        Seats
                      </th>

                      <th className="px-3 py-4">
                        Passengers
                      </th>

                      <th className="px-3 py-4">
                        Amount
                      </th>

                      <th className="px-3 py-4">
                        Booked At
                      </th>

                      <th className="px-3 py-4">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {bookingRecords.map(
                      (booking) => (
                        <tr
                          key={
                            booking.id
                          }
                          className="border-b border-[#c8cad4]/40 align-top transition hover:bg-[#f8f7ff]/70"
                        >
                          <td className="px-3 py-5">
                            <p className="font-black text-[#002451]">
                              {booking.bookingReference ??
                                "—"}
                            </p>
                          </td>

                          <td className="px-3 py-5">
                            <p className="max-w-[220px] font-bold text-[#002451]">
                              {getPassengerNames(
                                booking,
                              )}
                            </p>

                            {booking.contactPhone ? (
                              <p className="mt-1 text-xs text-[#747680]">
                                {
                                  booking.contactPhone
                                }
                              </p>
                            ) : null}
                          </td>

                          <td className="px-3 py-5 text-sm text-[#747680]">
                            {booking.origin &&
                            booking.destination
                              ? `${booking.origin} → ${booking.destination}`
                              : "—"}
                          </td>

                          <td className="px-3 py-5 text-sm text-[#747680]">
                            {booking.busType ??
                              "—"}
                          </td>

                          <td className="px-3 py-5 text-sm font-black text-[#002451]">
                            {booking
                              .seatNumbers
                              ?.length
                              ? booking.seatNumbers.join(
                                  ", ",
                                )
                              : "—"}
                          </td>

                          <td className="px-3 py-5 text-sm font-black text-[#002451]">
                            {getPassengerCount(
                              booking,
                            )}
                          </td>

                          <td className="px-3 py-5 font-black text-[#002451]">
                            GH₵
                            {getBookingAmount(
                              booking,
                            ).toFixed(
                              2,
                            )}
                          </td>

                          <td className="px-3 py-5 text-sm text-[#747680]">
                            {formatBookingTime(
                              booking.createdAt,
                            )}
                          </td>

                          <td className="px-3 py-5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black capitalize ${getStatusClasses(
                                booking.status,
                              )}`}
                            >
                              {booking.status ??
                                "pending"}
                            </span>

                            <p className="mt-2 text-xs capitalize text-[#747680]">
                              Payment:{" "}
                              {booking.paymentStatus ??
                                "unknown"}
                            </p>
                          </td>
                        </tr>
                      ),
                    )}

                    {bookingRecords.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-3 py-14 text-center"
                        >
                          <div className="mx-auto max-w-sm">
                            <p className="font-black text-[#002451]">
                              No bookings
                              for this
                              travel date
                            </p>

                            <p className="mt-2 text-sm leading-6 text-[#747680]">
                              There are no
                              passenger
                              booking records
                              for{" "}
                              {formatSelectedDate(
                                selectedDate,
                              )}
                              .
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ========================================
                Trip Summary
            ======================================== */}

            <section className="mt-8 rounded-3xl border border-[#c8cad4]/60 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-[#002451]">
                    Trip Configuration
                  </h2>

                  <p className="mt-1 text-sm text-[#747680]">
                    {trips.length} trip
                    {trips.length === 1
                      ? ""
                      : "s"}{" "}
                    currently configured
                    for {company.name}.
                  </p>
                </div>

                <Link
                  href="/operator/trips"
                  className="rounded-xl bg-[#002451] px-5 py-3 text-sm font-black text-white transition hover:bg-[#003b80]"
                >
                  Manage Trips
                </Link>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

// ========================================
// Dashboard Card
// ========================================

function DashboardCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#c8cad4]/40 bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-[#747680]">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black text-[#002451]">
        {value}
      </p>

      {description ? (
        <p className="mt-2 text-xs font-medium text-[#747680]">
          {description}
        </p>
      ) : null}
    </div>
  );
}