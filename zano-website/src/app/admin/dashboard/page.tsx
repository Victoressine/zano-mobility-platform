"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type AdminProfile = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
};

type AdminMetrics = {
  companies: {
    total: number;
    active: number;
  };

  operators: {
    total: number;
    active: number;
  };

  vehicles: {
    total: number;
    active: number;
  };

  trips: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  };

  bookings: {
    total: number;
    confirmed: number;
  };

  payments: {
    successful: number;
    revenue: number;
    currency: string;
  };

  passengers: {
    registered: number;
    booked: number;
  };
};

type RecentBooking = {
  id: string;
  bookingReference: string;
  companyName: string;
  origin: string;
  destination: string;
  travelDate: string;
  passengerCount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  createdAt: string | null;
};

type AdminOverviewResponse = {
  success: boolean;
  admin?: AdminProfile;
  metrics?: AdminMetrics;
  recentBookings?: RecentBooking[];
  generatedAt?: string;
  error?: string;
};

// ========================================
// Admin Dashboard
// ========================================

export default function AdminDashboardPage() {
  const router = useRouter();

  // ========================================
  // State
  // ========================================

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [admin, setAdmin] = useState<AdminProfile | null>(null);

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // ========================================
  // Authenticate + Load Overview
  // ========================================

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/admin/login");
        return;
      }

      try {
        setLoading(true);
        setError("");

        // ========================================
        // Verify Admin Profile
        // ========================================

        const userSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!userSnapshot.exists()) {
          throw new Error("Your administrator profile could not be found.");
        }

        const userData = userSnapshot.data();

        if (userData.role !== "admin") {
          await signOut(auth);

          router.replace("/admin/login");

          return;
        }

        // ========================================
        // Get Firebase ID Token
        // ========================================

        const idToken = await user.getIdToken();

        // ========================================
        // Secure Admin Overview API
        // ========================================

        const response = await fetch("/api/admin/overview", {
          method: "GET",

          headers: {
            Authorization: `Bearer ${idToken}`,
          },

          cache: "no-store",
        });

        const report = (await response.json()) as AdminOverviewResponse;

        if (
          !response.ok ||
          !report.success ||
          !report.admin ||
          !report.metrics
        ) {
          throw new Error(
            report.error || "Unable to load the admin dashboard.",
          );
        }

        if (cancelled) {
          return;
        }

        // ========================================
        // Store Dashboard Data
        // ========================================

        setCurrentUser(user);

        setAdmin(report.admin);

        setMetrics(report.metrics);

        setRecentBookings(
          Array.isArray(report.recentBookings) ? report.recentBookings : [],
        );
      } catch (loadError) {
        console.error("Admin dashboard load error:", loadError);

        if (!cancelled) {
          setCurrentUser(user);

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the admin dashboard.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  // ========================================
  // Sign Out
  // ========================================

  async function handleSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/admin/login");
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

          <p className="mt-4 font-bold text-[#002451]">Loading Zano Admin...</p>
        </div>
      </main>
    );
  }

  // ========================================
  // Error State
  // ========================================

  if (error || !admin || !metrics) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f7ff] px-5">
        <div className="w-full max-w-md rounded-3xl border border-[#c8cad4]/50 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl font-black text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-black text-[#002451]">
            Admin dashboard unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#747680]">
            {error || "The Zano administration dashboard could not be loaded."}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 w-full rounded-xl bg-[#002451] px-5 py-3 text-sm font-black text-white transition hover:bg-[#003b80]"
          >
            Return to Admin Login
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // Display Values
  // ========================================

  const adminName =
    [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
    admin.email ||
    "Administrator";

  const revenueCurrency = metrics.payments.currency || "GHS";

  // ========================================
  // Dashboard
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-screen">
        {/* ========================================
            Desktop Sidebar
        ======================================== */}

        <aside className="hidden w-64 shrink-0 flex-col bg-[#002451] px-5 py-7 text-white lg:flex">
          {/* Brand */}

          <Link href="/" className="px-3 text-3xl font-black tracking-tight">
            Zano
          </Link>

          <div className="mt-7 px-3">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#39b5f4]">
              Platform Admin
            </p>

            <p className="mt-2 text-sm leading-5 text-white/60">
              Simple platform management
            </p>
          </div>

          {/* ========================================
              Main Navigation
          ======================================== */}

          <nav className="mt-8 space-y-2">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-3 rounded-xl bg-[#ff7417] px-4 py-3 text-sm font-black text-white"
            >
              <DashboardIcon />
              Overview
            </Link>

            <Link
              href="/admin/companies"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <CompanyIcon />
              Companies
            </Link>

            <Link
              href="/admin/bookings"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <BookingIcon />
              Bookings
            </Link>
          </nav>

          {/* ========================================
              Sidebar Footer
          ======================================== */}

          <div className="mt-auto border-t border-white/10 pt-5">
            <div className="mb-4 px-3">
              <p className="truncate text-sm font-bold text-white">
                {adminName}
              </p>

              <p className="mt-1 truncate text-xs text-white/50">
                {currentUser?.email || admin.email}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ========================================
            Main Area
        ======================================== */}

        <section className="min-w-0 flex-1">
          {/* ========================================
              Header
          ======================================== */}

          <header className="border-b border-[#c8cad4]/60 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#747680]">Admin</p>

                <h1 className="text-2xl font-black text-[#002451]">Overview</h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-black text-[#002451]">
                    {adminName}
                  </p>

                  <p className="mt-1 text-xs text-[#747680]">
                    Platform Administrator
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-xl border border-[#c8cad4] px-4 py-2.5 text-sm font-bold text-[#002451] transition hover:bg-[#f8f7ff] lg:hidden"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          {/* ========================================
              Mobile Navigation
          ======================================== */}

          <nav className="border-b border-[#c8cad4]/60 bg-white px-5 py-3 lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
              <Link
                href="/admin/dashboard"
                className="shrink-0 rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white"
              >
                Overview
              </Link>

              <Link
                href="/admin/companies"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680] transition hover:bg-[#002451] hover:text-white"
              >
                Companies
              </Link>

              <Link
                href="/admin/bookings"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680] transition hover:bg-[#002451] hover:text-white"
              >
                Bookings
              </Link>
            </div>
          </nav>

          {/* ========================================
              Page Content
          ======================================== */}

          <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
            {/* ========================================
                Welcome
            ======================================== */}

            <section className="overflow-hidden rounded-3xl bg-[#002451] text-white">
              <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                <div className="flex items-center p-7 sm:p-9">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#39b5f4]">
                      Zano Platform
                    </p>

                    <h2 className="mt-3 text-3xl font-black">
                      Welcome, {adminName}
                    </h2>

                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
                      Here is a simple overview of what is happening across
                      Zano.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <SummaryPill
                        value={metrics.companies.total}
                        label="Companies"
                      />

                      <SummaryPill
                        value={metrics.bookings.total}
                        label="Bookings"
                      />

                      <SummaryPill value={metrics.trips.total} label="Trips" />
                    </div>
                  </div>
                </div>

                <div className="relative min-h-[230px] lg:min-h-[300px]">
                  <Image
                    src="/images/dashboard/zano bus 2.jpg"
                    alt="Zano intercity transport"
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 38vw"
                    className="object-cover"
                  />

                  <div className="absolute inset-0 bg-gradient-to-r from-[#002451]/45 via-[#002451]/10 to-transparent" />
                </div>
              </div>
            </section>

            {/* ========================================
                Main Numbers
            ======================================== */}

            <section className="mt-8">
              <div>
                <p className="text-sm font-bold text-[#747680]">
                  Today&apos;s platform view
                </p>

                <h2 className="mt-1 text-2xl font-black text-[#002451]">
                  Key numbers
                </h2>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard
                  label="Companies"
                  value={formatNumber(metrics.companies.total)}
                  description={`${formatNumber(
                    metrics.companies.active,
                  )} active`}
                />

                <DashboardCard
                  label="Bookings"
                  value={formatNumber(metrics.bookings.total)}
                  description={`${formatNumber(
                    metrics.bookings.confirmed,
                  )} confirmed`}
                />

                <DashboardCard
                  label="Passengers"
                  value={formatNumber(metrics.passengers.registered)}
                  description={`${formatNumber(
                    metrics.passengers.booked,
                  )} passenger seats booked`}
                />

                <DashboardCard
                  label="Revenue"
                  value={formatMoney(metrics.payments.revenue, revenueCurrency)}
                  description={`${formatNumber(
                    metrics.payments.successful,
                  )} successful payments`}
                />
              </div>
            </section>

            {/* ========================================
                Operations
            ======================================== */}

            <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Trip Activity */}

              <div className="rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[#747680]">Operations</p>

                  <h2 className="mt-1 text-xl font-black text-[#002451]">
                    Trip activity
                  </h2>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <StatusCard
                    label="Scheduled"
                    value={metrics.trips.scheduled}
                  />

                  <StatusCard
                    label="Completed"
                    value={metrics.trips.completed}
                  />

                  <StatusCard
                    label="Cancelled"
                    value={metrics.trips.cancelled}
                  />
                </div>
              </div>

              {/* Platform Resources */}

              <div className="rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[#747680]">Network</p>

                  <h2 className="mt-1 text-xl font-black text-[#002451]">
                    Platform resources
                  </h2>
                </div>

                <div className="mt-6 divide-y divide-[#c8cad4]/40">
                  <ResourceRow
                    label="Operators"
                    value={metrics.operators.total}
                    detail={`${metrics.operators.active} active`}
                  />

                  <ResourceRow
                    label="Vehicles"
                    value={metrics.vehicles.total}
                    detail={`${metrics.vehicles.active} active`}
                  />

                  <ResourceRow
                    label="Total Trips"
                    value={metrics.trips.total}
                    detail={`${metrics.trips.scheduled} scheduled`}
                  />
                </div>
              </div>
            </section>

            {/* ========================================
                Recent Bookings
            ======================================== */}

            <section className="mt-8 rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#747680]">Bookings</p>

                  <h2 className="mt-1 text-xl font-black text-[#002451]">
                    Recent bookings
                  </h2>

                  <p className="mt-2 text-sm text-[#747680]">
                    Latest passenger bookings across Zano.
                  </p>
                </div>

                <div className="rounded-xl bg-[#f8f7ff] px-4 py-2 text-sm font-black text-[#002451]">
                  {recentBookings.length} recent
                </div>
              </div>

              {/* Desktop Table */}

              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-left">
                  <thead>
                    <tr className="border-b border-[#c8cad4]/70 text-xs uppercase tracking-wider text-[#747680]">
                      <th className="px-3 py-4">Reference</th>

                      <th className="px-3 py-4">Company</th>

                      <th className="px-3 py-4">Route</th>

                      <th className="px-3 py-4">Travel Date</th>

                      <th className="px-3 py-4">Amount</th>

                      <th className="px-3 py-4">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentBookings.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-b border-[#c8cad4]/40 last:border-b-0"
                      >
                        <td className="px-3 py-5 text-sm font-black text-[#002451]">
                          {booking.bookingReference || "—"}
                        </td>

                        <td className="px-3 py-5 text-sm font-bold text-[#002451]">
                          {booking.companyName || "—"}
                        </td>

                        <td className="px-3 py-5 text-sm text-[#747680]">
                          {formatRoute(booking.origin, booking.destination)}
                        </td>

                        <td className="px-3 py-5 text-sm text-[#747680]">
                          {formatTravelDate(booking.travelDate)}
                        </td>

                        <td className="px-3 py-5 text-sm font-black text-[#002451]">
                          {formatMoney(
                            booking.totalAmount,
                            booking.currency || revenueCurrency,
                          )}
                        </td>

                        <td className="px-3 py-5">
                          <BookingStatus
                            status={booking.status}
                            paymentStatus={booking.paymentStatus}
                          />
                        </td>
                      </tr>
                    ))}

                    {recentBookings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-14 text-center">
                          <EmptyBookings />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {/* Mobile Booking Cards */}

              <div className="mt-6 space-y-4 md:hidden">
                {recentBookings.map((booking) => (
                  <article
                    key={booking.id}
                    className="rounded-2xl border border-[#c8cad4]/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-[#747680]">
                          Reference
                        </p>

                        <p className="mt-1 font-black text-[#002451]">
                          {booking.bookingReference || "—"}
                        </p>
                      </div>

                      <BookingStatus
                        status={booking.status}
                        paymentStatus={booking.paymentStatus}
                      />
                    </div>

                    <div className="mt-4 border-t border-[#c8cad4]/40 pt-4">
                      <p className="font-bold text-[#002451]">
                        {booking.companyName || "—"}
                      </p>

                      <p className="mt-1 text-sm text-[#747680]">
                        {formatRoute(booking.origin, booking.destination)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#747680]">Travel date</p>

                        <p className="mt-1 text-sm font-bold text-[#002451]">
                          {formatTravelDate(booking.travelDate)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-[#747680]">Amount</p>

                        <p className="mt-1 font-black text-[#002451]">
                          {formatMoney(
                            booking.totalAmount,
                            booking.currency || revenueCurrency,
                          )}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}

                {recentBookings.length === 0 ? (
                  <div className="py-10">
                    <EmptyBookings />
                  </div>
                ) : null}
              </div>
            </section>

            {/* ========================================
                Footer Note
            ======================================== */}

            <footer className="py-8 text-center">
              <p className="text-xs text-[#747680]">
                Zano Administration · Travel Smarter. Move Better.
              </p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

// ========================================
// Summary Pill
// ========================================

function SummaryPill({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
      <span className="font-black text-white">{formatNumber(value)}</span>

      <span className="ml-2 text-sm text-white/65">{label}</span>
    </div>
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
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-[#747680]">{label}</p>

      <p className="mt-3 break-words text-3xl font-black text-[#002451]">
        {value}
      </p>

      <p className="mt-2 text-xs font-medium text-[#747680]">{description}</p>
    </div>
  );
}

// ========================================
// Status Card
// ========================================

function StatusCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#f8f7ff] p-5">
      <p className="text-sm font-bold text-[#747680]">{label}</p>

      <p className="mt-2 text-2xl font-black text-[#002451]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

// ========================================
// Resource Row
// ========================================

function ResourceRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-bold text-[#002451]">{label}</p>

        <p className="mt-1 text-xs text-[#747680]">{detail}</p>
      </div>

      <p className="text-xl font-black text-[#002451]">{formatNumber(value)}</p>
    </div>
  );
}

// ========================================
// Booking Status
// ========================================

function BookingStatus({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus: string;
}) {
  return (
    <div>
      <span
        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black capitalize ${getStatusClasses(
          status,
        )}`}
      >
        {status || "unknown"}
      </span>

      <p className="mt-1.5 text-xs capitalize text-[#747680]">
        Payment: {paymentStatus || "unknown"}
      </p>
    </div>
  );
}

// ========================================
// Empty Booking State
// ========================================

function EmptyBookings() {
  return (
    <div className="text-center">
      <p className="font-black text-[#002451]">No bookings yet</p>

      <p className="mt-2 text-sm text-[#747680]">
        New passenger bookings will appear here.
      </p>
    </div>
  );
}

// ========================================
// Navigation Icons
// ========================================

function DashboardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />

      <rect x="14" y="3" width="7" height="7" rx="1" />

      <rect x="3" y="14" width="7" height="7" rx="1" />

      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function CompanyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 21h18" />
      <path d="M6 21V7l6-4 6 4v14" />
      <path d="M9 10h1" />
      <path d="M14 10h1" />
      <path d="M9 14h1" />
      <path d="M14 14h1" />
    </svg>
  );
}

function BookingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M5 4h14a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 1 2-2Z" />

      <path d="M13 8h4" />
      <path d="M13 12h4" />
      <path d="M13 16h4" />
    </svg>
  );
}

// ========================================
// Number Formatter
// ========================================

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-GH").format(value);
}

// ========================================
// Money Formatter
// ========================================

function formatMoney(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0;

  const normalizedCurrency =
    currency === "GHS" || currency === "GH₵" ? "GHS" : currency || "GHS";

  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `GH₵${safeValue.toFixed(2)}`;
  }
}

// ========================================
// Route Formatter
// ========================================

function formatRoute(origin: string, destination: string) {
  if (origin && destination) {
    return `${origin} → ${destination}`;
  }

  return origin || destination || "—";
}

// ========================================
// Travel Date Formatter
// ========================================

function formatTravelDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

// ========================================
// Status Styling
// ========================================

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
    case "completed":
      return "bg-green-50 text-green-700";

    case "cancelled":
      return "bg-red-50 text-red-700";

    case "pending":
      return "bg-amber-50 text-amber-700";

    default:
      return "bg-[#f8f7ff] text-[#747680]";
  }
}
