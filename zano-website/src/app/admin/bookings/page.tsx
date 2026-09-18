"use client";

// ========================================
// Imports
// ========================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  type User,
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

import {
  auth,
  db,
} from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type PassengerRecord = {
  fullName: string;
  phoneNumber: string;
  seatId: string;
  seatNumber: string;
};

type Booking = {
  id: string;

  bookingReference: string;

  userId: string;
  tripId: string;

  companyId: string;
  companyName: string;

  routeId: string;

  origin: string;
  destination: string;
  busType: string;

  scheduleType: string;
  inventoryType: string;

  travelDate: string;

  departureAt: string | null;
  arrivalAt: string | null;

  passengerCount: number;

  passengers: PassengerRecord[];

  seatNumbers: string[];

  fare: number;
  subtotal: number;
  bookingFee: number;
  totalAmount: number;

  currency: string;

  status: string;

  paymentStatus: string;
  paymentMethod: string;

  paymentId: string;
  paymentReference: string;

  ticketId: string;
  ticketNumber: string;

  contactEmail: string;
  contactPhone: string;

  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type CompanyOption = {
  id: string;
  name: string;
};

type BookingSummary = {
  total: number;
  confirmed: number;
  cancelled: number;
  pending: number;
  successfulPayments: number;
  passengerSeats: number;
  revenue: number;
  currency: string;
};

type BookingsResponse = {
  success: boolean;

  summary?: BookingSummary;

  companies?: CompanyOption[];

  bookings?: Booking[];

  generatedAt?: string;

  error?: string;
};

// ========================================
// Page
// ========================================

export default function AdminBookingsPage() {
  const router = useRouter();

  // ========================================
  // State
  // ========================================

  const [
    currentUser,
    setCurrentUser,
  ] = useState<User | null>(
    null,
  );

  const [
    bookings,
    setBookings,
  ] = useState<Booking[]>([]);

  const [
    companies,
    setCompanies,
  ] = useState<
    CompanyOption[]
  >([]);

  const [
    summary,
    setSummary,
  ] = useState<BookingSummary>({
    total: 0,
    confirmed: 0,
    cancelled: 0,
    pending: 0,
    successfulPayments: 0,
    passengerSeats: 0,
    revenue: 0,
    currency: "GHS",
  });

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
    paymentFilter,
    setPaymentFilter,
  ] = useState("all");

  const [
    companyFilter,
    setCompanyFilter,
  ] = useState("all");

  const [
    travelDateFilter,
    setTravelDateFilter,
  ] = useState("");

  const [
    selectedBooking,
    setSelectedBooking,
  ] = useState<Booking | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  // ========================================
  // Authenticate + Load Bookings
  // ========================================

  useEffect(() => {
    let cancelled = false;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            router.replace(
              "/admin/login",
            );

            return;
          }

          try {
            setLoading(true);
            setError("");

            // ========================================
            // Confirm Client Admin Profile
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
              !userSnapshot.exists()
            ) {
              throw new Error(
                "Your administrator profile could not be found.",
              );
            }

            if (
              userSnapshot.data()
                .role !== "admin"
            ) {
              await signOut(
                auth,
              );

              router.replace(
                "/admin/login",
              );

              return;
            }

            // ========================================
            // Secure API Request
            // ========================================

            const idToken =
              await user.getIdToken();

            const response =
              await fetch(
                "/api/admin/bookings",
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

            const result =
              (await response.json()) as
                BookingsResponse;

            if (
              !response.ok ||
              !result.success
            ) {
              throw new Error(
                result.error ||
                  "Unable to load bookings.",
              );
            }

            if (cancelled) {
              return;
            }

            setCurrentUser(
              user,
            );

            setBookings(
              Array.isArray(
                result.bookings,
              )
                ? result.bookings
                : [],
            );

            setCompanies(
              Array.isArray(
                result.companies,
              )
                ? result.companies
                : [],
            );

            setSummary(
              result.summary ?? {
                total: 0,
                confirmed: 0,
                cancelled: 0,
                pending: 0,
                successfulPayments: 0,
                passengerSeats: 0,
                revenue: 0,
                currency:
                  "GHS",
              },
            );
          } catch (
            loadError
          ) {
            console.error(
              "Admin bookings load error:",
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
                  : "Unable to load bookings.",
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
  // Filtered Bookings
  // ========================================

  const filteredBookings =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return bookings.filter(
        (booking) => {
          const matchesStatus =
            statusFilter ===
              "all" ||
            booking.status
              .toLowerCase() ===
              statusFilter;

          const matchesPayment =
            paymentFilter ===
              "all" ||
            booking.paymentStatus
              .toLowerCase() ===
              paymentFilter;

          const matchesCompany =
            companyFilter ===
              "all" ||
            booking.companyId ===
              companyFilter;

          const matchesDate =
            !travelDateFilter ||
            booking.travelDate ===
              travelDateFilter;

          const passengerText =
            booking.passengers
              .map(
                (passenger) =>
                  `${passenger.fullName} ${passenger.phoneNumber}`,
              )
              .join(" ")
              .toLowerCase();

          const searchText = [
            booking.bookingReference,
            booking.companyName,
            booking.origin,
            booking.destination,
            booking.contactEmail,
            booking.contactPhone,
            booking.paymentReference,
            booking.ticketNumber,
            booking.seatNumbers.join(
              " ",
            ),
            passengerText,
          ]
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            !query ||
            searchText.includes(
              query,
            );

          return (
            matchesStatus &&
            matchesPayment &&
            matchesCompany &&
            matchesDate &&
            matchesSearch
          );
        },
      );
    }, [
      bookings,
      companyFilter,
      paymentFilter,
      search,
      statusFilter,
      travelDateFilter,
    ]);

  // ========================================
  // Filtered Totals
  // ========================================

  const filteredTotals =
    useMemo(() => {
      let passengers = 0;
      let revenue = 0;

      for (
        const booking of
        filteredBookings
      ) {
        passengers +=
          booking.passengerCount;

        if (
          booking.status
            .toLowerCase() ===
            "confirmed" &&
          booking.paymentStatus
            .toLowerCase() ===
            "successful"
        ) {
          revenue +=
            booking.totalAmount;
        }
      }

      return {
        passengers,
        revenue,
      };
    }, [filteredBookings]);

  // ========================================
  // Clear Filters
  // ========================================

  function clearFilters() {
    setSearch("");
    setStatusFilter(
      "all",
    );
    setPaymentFilter(
      "all",
    );
    setCompanyFilter(
      "all",
    );
    setTravelDateFilter(
      "",
    );
  }

  // ========================================
  // Sign Out
  // ========================================

  async function handleSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace(
        "/admin/login",
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
            Loading bookings...
          </p>
        </div>
      </main>
    );
  }

  // ========================================
  // Page
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-screen">
        {/* ========================================
            Desktop Sidebar
        ======================================== */}

        <aside className="hidden w-64 shrink-0 flex-col bg-[#002451] px-5 py-7 text-white lg:flex">
          <Link
            href="/"
            className="px-3 text-3xl font-black tracking-tight"
          >
            Zano
          </Link>

          <div className="mt-7 px-3">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#39b5f4]">
              Platform Admin
            </p>

            <p className="mt-2 text-sm leading-5 text-white/60">
              Simple platform
              management
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            <Link
              href="/admin/dashboard"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Overview
            </Link>

            <Link
              href="/admin/companies"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Companies
            </Link>

            <Link
              href="/admin/bookings"
              className="block rounded-xl bg-[#ff7417] px-4 py-3 text-sm font-black text-white"
            >
              Bookings
            </Link>
          </nav>

          <div className="mt-auto border-t border-white/10 pt-5">
            <p className="truncate px-3 text-xs font-bold text-white/45">
              {currentUser?.email ??
                "Administrator"}
            </p>

            <button
              type="button"
              onClick={
                handleSignOut
              }
              className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ========================================
            Main Content
        ======================================== */}

        <section className="min-w-0 flex-1">
          {/* Header */}

          <header className="border-b border-[#c8cad4]/60 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#747680]">
                  Admin
                </p>

                <h1 className="text-2xl font-black text-[#002451]">
                  Bookings
                </h1>
              </div>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                className="rounded-xl border border-[#c8cad4] px-4 py-2.5 text-sm font-bold text-[#002451] lg:hidden"
              >
                Sign Out
              </button>
            </div>
          </header>

          {/* ========================================
              Mobile Navigation
          ======================================== */}

          <nav className="border-b border-[#c8cad4]/60 bg-white px-5 py-3 lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
              <Link
                href="/admin/dashboard"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680]"
              >
                Overview
              </Link>

              <Link
                href="/admin/companies"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680]"
              >
                Companies
              </Link>

              <Link
                href="/admin/bookings"
                className="shrink-0 rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white"
              >
                Bookings
              </Link>
            </div>
          </nav>

          {/* ========================================
              Content
          ======================================== */}

          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
            <section>
              <p className="text-sm font-bold text-[#747680]">
                Platform activity
              </p>

              <h2 className="mt-1 text-3xl font-black text-[#002451]">
                Passenger Bookings
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#747680]">
                View bookings,
                passengers, payments,
                routes and travel
                information across Zano.
              </p>
            </section>

            {/* Error */}

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                {error}
              </div>
            ) : null}

            {/* ========================================
                Summary Cards
            ======================================== */}

            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total Bookings"
                value={formatNumber(
                  summary.total,
                )}
                note={`${summary.confirmed} confirmed`}
              />

              <SummaryCard
                label="Passengers"
                value={formatNumber(
                  summary.passengerSeats,
                )}
                note="Passenger seats booked"
              />

              <SummaryCard
                label="Revenue"
                value={formatMoney(
                  summary.revenue,
                  summary.currency,
                )}
                note={`${summary.successfulPayments} successful payments`}
              />

              <SummaryCard
                label="Cancelled"
                value={formatNumber(
                  summary.cancelled,
                )}
                note={`${summary.pending} pending`}
              />
            </section>

            {/* ========================================
                Filters
            ======================================== */}

            <section className="mt-7 rounded-3xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
                {/* Search */}

                <div className="xl:col-span-2">
                  <label
                    htmlFor="booking-search"
                    className="mb-2 block text-xs font-black uppercase tracking-wide text-[#747680]"
                  >
                    Search
                  </label>

                  <input
                    id="booking-search"
                    type="search"
                    value={search}
                    onChange={(
                      event,
                    ) =>
                      setSearch(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Reference, passenger, phone, route..."
                    className={
                      inputClasses
                    }
                  />
                </div>

                {/* Company */}

                <FilterField
                  label="Company"
                >
                  <select
                    value={
                      companyFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setCompanyFilter(
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClasses
                    }
                  >
                    <option value="all">
                      All companies
                    </option>

                    {companies.map(
                      (company) => (
                        <option
                          key={
                            company.id
                          }
                          value={
                            company.id
                          }
                        >
                          {
                            company.name
                          }
                        </option>
                      ),
                    )}
                  </select>
                </FilterField>

                {/* Booking Status */}

                <FilterField
                  label="Booking Status"
                >
                  <select
                    value={
                      statusFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setStatusFilter(
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClasses
                    }
                  >
                    <option value="all">
                      All statuses
                    </option>

                    <option value="confirmed">
                      Confirmed
                    </option>

                    <option value="pending">
                      Pending
                    </option>

                    <option value="cancelled">
                      Cancelled
                    </option>
                  </select>
                </FilterField>

                {/* Payment */}

                <FilterField
                  label="Payment"
                >
                  <select
                    value={
                      paymentFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setPaymentFilter(
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClasses
                    }
                  >
                    <option value="all">
                      All payments
                    </option>

                    <option value="successful">
                      Successful
                    </option>

                    <option value="pending">
                      Pending
                    </option>

                    <option value="failed">
                      Failed
                    </option>

                    <option value="refunded">
                      Refunded
                    </option>
                  </select>
                </FilterField>
              </div>

              <div className="mt-4 flex flex-col gap-4 border-t border-[#c8cad4]/40 pt-4 sm:flex-row sm:items-end sm:justify-between">
                <FilterField
                  label="Travel Date"
                >
                  <input
                    type="date"
                    value={
                      travelDateFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setTravelDateFilter(
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClasses
                    }
                  />
                </FilterField>

                <button
                  type="button"
                  onClick={
                    clearFilters
                  }
                  className="rounded-xl border border-[#c8cad4] px-4 py-3 text-sm font-black text-[#002451] transition hover:bg-[#f8f7ff]"
                >
                  Clear Filters
                </button>
              </div>
            </section>

            {/* ========================================
                Current Results
            ======================================== */}

            <section className="mt-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#002451]">
                    All Bookings
                  </h2>

                  <p className="mt-1 text-sm text-[#747680]">
                    {
                      filteredBookings.length
                    }{" "}
                    booking
                    {filteredBookings.length ===
                    1
                      ? ""
                      : "s"}{" "}
                    shown
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#747680]">
                    Filtered Revenue
                  </p>

                  <p className="mt-1 text-lg font-black text-[#002451]">
                    {formatMoney(
                      filteredTotals.revenue,
                      summary.currency,
                    )}
                  </p>

                  <p className="text-xs text-[#747680]">
                    {
                      filteredTotals.passengers
                    }{" "}
                    passenger seats
                  </p>
                </div>
              </div>

              {/* ========================================
                  Desktop Table
              ======================================== */}

              <div className="mt-5 hidden overflow-hidden rounded-3xl border border-[#c8cad4]/50 bg-white shadow-sm lg:block">
                {filteredBookings.length >
                0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] border-collapse text-left">
                      <thead className="bg-[#f8f7ff]">
                        <tr>
                          <TableHeader>
                            Reference
                          </TableHeader>

                          <TableHeader>
                            Passenger
                          </TableHeader>

                          <TableHeader>
                            Company
                          </TableHeader>

                          <TableHeader>
                            Route
                          </TableHeader>

                          <TableHeader>
                            Travel Date
                          </TableHeader>

                          <TableHeader>
                            Seats
                          </TableHeader>

                          <TableHeader>
                            Amount
                          </TableHeader>

                          <TableHeader>
                            Payment
                          </TableHeader>

                          <TableHeader>
                            Status
                          </TableHeader>

                          <TableHeader>
                            Action
                          </TableHeader>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredBookings.map(
                          (
                            booking,
                          ) => (
                            <tr
                              key={
                                booking.id
                              }
                              className="border-t border-[#c8cad4]/40"
                            >
                              <TableCell>
                                <p className="font-black text-[#002451]">
                                  {booking.bookingReference ||
                                    booking.id}
                                </p>

                                <p className="mt-1 text-xs text-[#747680]">
                                  {formatDateTime(
                                    booking.createdAt,
                                  )}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-bold text-[#002451]">
                                  {getPrimaryPassengerName(
                                    booking,
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-[#747680]">
                                  {booking.passengerCount}{" "}
                                  passenger
                                  {booking.passengerCount ===
                                  1
                                    ? ""
                                    : "s"}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-bold text-[#002451]">
                                  {booking.companyName ||
                                    "—"}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-bold text-[#002451]">
                                  {formatRoute(
                                    booking.origin,
                                    booking.destination,
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-[#747680]">
                                  {booking.busType ||
                                    "Bus"}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-bold text-[#002451]">
                                  {formatTravelDate(
                                    booking.travelDate,
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-[#747680]">
                                  {formatTime(
                                    booking.departureAt,
                                  )}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-bold text-[#002451]">
                                  {booking.seatNumbers.length >
                                  0
                                    ? booking.seatNumbers.join(
                                        ", ",
                                      )
                                    : "—"}
                                </p>
                              </TableCell>

                              <TableCell>
                                <p className="font-black text-[#002451]">
                                  {formatMoney(
                                    booking.totalAmount,
                                    booking.currency,
                                  )}
                                </p>
                              </TableCell>

                              <TableCell>
                                <StatusBadge
                                  status={
                                    booking.paymentStatus
                                  }
                                />
                              </TableCell>

                              <TableCell>
                                <StatusBadge
                                  status={
                                    booking.status
                                  }
                                />
                              </TableCell>

                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedBooking(
                                      booking,
                                    )
                                  }
                                  className="whitespace-nowrap rounded-xl border border-[#c8cad4] px-3 py-2 text-xs font-black text-[#002451] transition hover:bg-[#f8f7ff]"
                                >
                                  View Details
                                </button>
                              </TableCell>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyBookings />
                )}
              </div>

              {/* ========================================
                  Mobile Cards
              ======================================== */}

              <div className="mt-5 grid gap-4 lg:hidden">
                {filteredBookings.length >
                0 ? (
                  filteredBookings.map(
                    (booking) => (
                      <article
                        key={
                          booking.id
                        }
                        className="rounded-3xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-black text-[#002451]">
                              {booking.bookingReference ||
                                booking.id}
                            </p>

                            <p className="mt-1 text-xs text-[#747680]">
                              {formatDateTime(
                                booking.createdAt,
                              )}
                            </p>
                          </div>

                          <StatusBadge
                            status={
                              booking.status
                            }
                          />
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-4">
                          <MobileField
                            label="Passenger"
                            value={getPrimaryPassengerName(
                              booking,
                            )}
                          />

                          <MobileField
                            label="Company"
                            value={
                              booking.companyName ||
                              "—"
                            }
                          />

                          <MobileField
                            label="Route"
                            value={formatRoute(
                              booking.origin,
                              booking.destination,
                            )}
                          />

                          <MobileField
                            label="Travel Date"
                            value={formatTravelDate(
                              booking.travelDate,
                            )}
                          />

                          <MobileField
                            label="Seats"
                            value={
                              booking.seatNumbers.join(
                                ", ",
                              ) ||
                              "—"
                            }
                          />

                          <MobileField
                            label="Amount"
                            value={formatMoney(
                              booking.totalAmount,
                              booking.currency,
                            )}
                          />
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#c8cad4]/40 pt-4">
                          <StatusBadge
                            status={
                              booking.paymentStatus
                            }
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedBooking(
                                booking,
                              )
                            }
                            className="rounded-xl bg-[#002451] px-4 py-2.5 text-sm font-black text-white"
                          >
                            View Details
                          </button>
                        </div>
                      </article>
                    ),
                  )
                ) : (
                  <EmptyBookings />
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      {/* ========================================
          Booking Details
      ======================================== */}

      {selectedBooking ? (
        <BookingDetailsModal
          booking={
            selectedBooking
          }
          onClose={() =>
            setSelectedBooking(
              null,
            )
          }
        />
      ) : null}
    </main>
  );
}

// ========================================
// Booking Details Modal
// ========================================

function BookingDetailsModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#002451]/60 p-4"
      role="presentation"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-details-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        {/* Header */}

        <div className="flex items-start justify-between gap-4 border-b border-[#c8cad4]/50 p-6">
          <div>
            <p className="text-sm font-bold text-[#747680]">
              Booking Details
            </p>

            <h2
              id="booking-details-title"
              className="mt-1 break-all text-2xl font-black text-[#002451]"
            >
              {booking.bookingReference ||
                booking.id}
            </h2>

            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge
                status={
                  booking.status
                }
              />

              <StatusBadge
                status={
                  booking.paymentStatus
                }
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f8f7ff] text-xl font-black text-[#002451]"
          >
            ×
          </button>
        </div>

        <div className="space-y-7 p-6">
          {/* Journey */}

          <DetailSection
            title="Journey"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="Company"
                value={
                  booking.companyName ||
                  "—"
                }
              />

              <DetailField
                label="Route"
                value={formatRoute(
                  booking.origin,
                  booking.destination,
                )}
              />

              <DetailField
                label="Bus Type"
                value={
                  booking.busType ||
                  "—"
                }
              />

              <DetailField
                label="Travel Date"
                value={formatTravelDate(
                  booking.travelDate,
                )}
              />

              <DetailField
                label="Departure"
                value={formatDateTime(
                  booking.departureAt,
                )}
              />

              <DetailField
                label="Arrival"
                value={formatDateTime(
                  booking.arrivalAt,
                )}
              />
            </div>
          </DetailSection>

          {/* Passengers */}

          <DetailSection
            title={`Passengers (${booking.passengerCount})`}
          >
            {booking.passengers.length >
            0 ? (
              <div className="space-y-3">
                {booking.passengers.map(
                  (
                    passenger,
                    index,
                  ) => (
                    <div
                      key={`${passenger.seatId}-${index}`}
                      className="grid gap-3 rounded-2xl bg-[#f8f7ff] p-4 sm:grid-cols-3"
                    >
                      <DetailField
                        label={`Passenger ${index + 1}`}
                        value={
                          passenger.fullName ||
                          "—"
                        }
                      />

                      <DetailField
                        label="Phone"
                        value={
                          passenger.phoneNumber ||
                          (index ===
                          0
                            ? booking.contactPhone
                            : "—")
                        }
                      />

                      <DetailField
                        label="Seat"
                        value={
                          passenger.seatNumber ||
                          booking.seatNumbers[
                            index
                          ] ||
                          "—"
                        }
                      />
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-[#747680]">
                No passenger details
                available.
              </p>
            )}
          </DetailSection>

          {/* Contact */}

          <DetailSection
            title="Booking Contact"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Email"
                value={
                  booking.contactEmail ||
                  "—"
                }
              />

              <DetailField
                label="Phone"
                value={
                  booking.contactPhone ||
                  "—"
                }
              />
            </div>
          </DetailSection>

          {/* Payment */}

          <DetailSection
            title="Payment"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="Fare per Passenger"
                value={formatMoney(
                  booking.fare,
                  booking.currency,
                )}
              />

              <DetailField
                label="Subtotal"
                value={formatMoney(
                  booking.subtotal,
                  booking.currency,
                )}
              />

              <DetailField
                label="Booking Fee"
                value={formatMoney(
                  booking.bookingFee,
                  booking.currency,
                )}
              />

              <DetailField
                label="Total Amount"
                value={formatMoney(
                  booking.totalAmount,
                  booking.currency,
                )}
              />

              <DetailField
                label="Payment Method"
                value={
                  booking.paymentMethod ||
                  "—"
                }
              />

              <DetailField
                label="Payment Status"
                value={
                  booking.paymentStatus ||
                  "—"
                }
              />

              <DetailField
                label="Payment Reference"
                value={
                  booking.paymentReference ||
                  "—"
                }
              />

              <DetailField
                label="Paid At"
                value={formatDateTime(
                  booking.paidAt,
                )}
              />
            </div>
          </DetailSection>

          {/* Ticket */}

          <DetailSection
            title="Ticket"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Ticket Number"
                value={
                  booking.ticketNumber ||
                  "—"
                }
              />

              <DetailField
                label="Seats"
                value={
                  booking.seatNumbers.join(
                    ", ",
                  ) || "—"
                }
              />
            </div>
          </DetailSection>

          {/* System Information */}

          <DetailSection
            title="System Information"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="Booking ID"
                value={
                  booking.id
                }
              />

              <DetailField
                label="Trip ID"
                value={
                  booking.tripId ||
                  "—"
                }
              />

              <DetailField
                label="Created"
                value={formatDateTime(
                  booking.createdAt,
                )}
              />

              <DetailField
                label="Confirmed"
                value={formatDateTime(
                  booking.confirmedAt,
                )}
              />
            </div>
          </DetailSection>
        </div>

        <div className="border-t border-[#c8cad4]/50 p-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#002451] px-5 py-3 text-sm font-black text-white sm:w-auto"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

// ========================================
// Summary Card
// ========================================

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="rounded-2xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-[#747680]">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-[#002451]">
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-[#747680]">
        {note}
      </p>
    </article>
  );
}

// ========================================
// Filter Field
// ========================================

function FilterField({
  label,
  children,
}: {
  label: string;
  children:
    React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-[#747680]">
        {label}
      </span>

      {children}
    </label>
  );
}

// ========================================
// Table
// ========================================

function TableHeader({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th className="whitespace-nowrap px-4 py-4 text-xs font-black uppercase tracking-wide text-[#747680]">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <td className="px-4 py-4 align-top text-sm">
      {children}
    </td>
  );
}

// ========================================
// Mobile Field
// ========================================

function MobileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#747680]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-bold text-[#002451]">
        {value}
      </p>
    </div>
  );
}

// ========================================
// Detail Components
// ========================================

function DetailSection({
  title,
  children,
}: {
  title: string;
  children:
    React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-4 text-lg font-black text-[#002451]">
        {title}
      </h3>

      {children}
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#747680]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-bold text-[#002451]">
        {value}
      </p>
    </div>
  );
}

// ========================================
// Status Badge
// ========================================

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status
      .trim()
      .toLowerCase();

  let classes =
    "bg-[#f8f7ff] text-[#747680]";

  if (
    normalized ===
      "successful" ||
    normalized ===
      "confirmed" ||
    normalized ===
      "valid"
  ) {
    classes =
      "bg-green-50 text-green-700";
  } else if (
    normalized ===
      "pending" ||
    normalized ===
      "processing"
  ) {
    classes =
      "bg-amber-50 text-amber-700";
  } else if (
    normalized ===
      "failed" ||
    normalized ===
      "cancelled" ||
    normalized ===
      "refunded"
  ) {
    classes =
      "bg-red-50 text-red-700";
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-black capitalize ${classes}`}
    >
      {normalized ||
        "unknown"}
    </span>
  );
}

// ========================================
// Empty State
// ========================================

function EmptyBookings() {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-lg font-black text-[#002451]">
        No bookings found
      </p>

      <p className="mt-2 text-sm text-[#747680]">
        Try changing the search
        or filters.
      </p>
    </div>
  );
}

// ========================================
// Helpers
// ========================================

function getPrimaryPassengerName(
  booking: Booking,
) {
  return (
    booking.passengers[0]
      ?.fullName ||
    booking.contactEmail ||
    booking.contactPhone ||
    "Passenger"
  );
}

function formatRoute(
  origin: string,
  destination: string,
) {
  if (
    !origin &&
    !destination
  ) {
    return "—";
  }

  return `${origin || "—"} → ${destination || "—"}`;
}

function formatNumber(
  value: number,
) {
  const safeValue =
    Number.isFinite(value)
      ? value
      : 0;

  return new Intl.NumberFormat(
    "en-GH",
  ).format(safeValue);
}

function formatMoney(
  value: number,
  currency = "GHS",
) {
  const safeValue =
    Number.isFinite(value)
      ? value
      : 0;

  const normalizedCurrency =
    currency === "GH₵"
      ? "GHS"
      : currency || "GHS";

  try {
    return new Intl.NumberFormat(
      "en-GH",
      {
        style: "currency",
        currency:
          normalizedCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(safeValue);
  } catch {
    return `GH₵${safeValue.toLocaleString(
      "en-GH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}`;
  }
}

function formatTravelDate(
  value: string,
) {
  if (!value) {
    return "—";
  }

  const parts =
    value.split("-");

  if (
    parts.length !== 3
  ) {
    return value;
  }

  const [
    year,
    month,
    day,
  ] = parts.map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
      ),
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    },
  ).format(date);
}

function formatTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    },
  ).format(date);
}

// ========================================
// Shared Input Style
// ========================================

const inputClasses =
  "w-full rounded-xl border border-[#c8cad4] bg-white px-4 py-3 text-sm text-[#002451] outline-none transition focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/15";