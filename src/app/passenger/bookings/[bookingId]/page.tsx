"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase/client";

/* ========================================
   Types
======================================== */

type BookingPassenger = {
  fullName: string;
  phoneNumber: string;
  seatId: string;
  seatNumber: string;
};

type Booking = {
  id: string;
  bookingReference: string;

  status: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentReference: string;

  tripId: string;

  companyId: string;
  companyName: string;

  routeId: string;

  origin: string;
  destination: string;
  busType: string;

  travelDate: string;
  departureAt: string | null;
  arrivalAt: string | null;

  passengerCount: number;
  passengers: BookingPassenger[];

  seatIds: string[];
  seatNumbers: string[];

  fare: number;
  subtotal: number;
  bookingFee: number;
  totalAmount: number;
  currency: string;

  contactEmail: string;
  contactPhone: string;

  ticketId: string | null;
  ticketNumber: string | null;
  ticketStatus: string | null;

  paymentId: string | null;

  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BookingResponse = {
  booking?: Booking;
  error?: string;
};

/* ========================================
   Booking Details Page
======================================== */

export default function BookingDetailsPage() {
  const router = useRouter();

  const params = useParams<{
    bookingId: string;
  }>();

  const bookingId =
    typeof params.bookingId === "string"
      ? params.bookingId
      : "";

  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* ========================================
     Load Booking
  ======================================== */

  const loadBooking = useCallback(
    async (user: User) => {
      if (!bookingId) {
        throw new Error(
          "Booking information is missing."
        );
      }

      const idToken =
        await user.getIdToken();

      const response = await fetch(
        `/api/bookings/${encodeURIComponent(
          bookingId
        )}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${idToken}`,
          },

          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as
          BookingResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "We could not load your booking."
        );
      }

      if (!data.booking) {
        throw new Error(
          "The booking response is incomplete."
        );
      }

      setBooking(data.booking);
    },
    [bookingId]
  );

  /* ========================================
     Authentication
  ======================================== */

  useEffect(() => {
    let cancelled = false;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            const returnUrl =
              `/passenger/bookings/${bookingId}`;

            router.replace(
              `/login?returnUrl=${encodeURIComponent(
                returnUrl
              )}`
            );

            return;
          }

          try {
            setLoading(true);
            setError("");

            await loadBooking(user);
          } catch (loadError) {
            console.error(
              "Booking details error:",
              loadError
            );

            if (!cancelled) {
              setError(
                getErrorMessage(
                  loadError
                )
              );
            }
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        }
      );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    bookingId,
    loadBooking,
    router,
  ]);

  /* ========================================
     Loading
  ======================================== */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#e6e7ec] border-t-[#ff7417]" />

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Loading your booking
          </h1>

          <p className="mt-2 text-sm text-[#747680]">
            Retrieving your trip and payment details.
          </p>
        </div>
      </main>
    );
  }

  /* ========================================
     Error
  ======================================== */

  if (error || !booking) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-xl font-bold text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Booking unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#747680]">
            {error ||
              "We could not load this booking."}
          </p>

          <Link
            href="/passenger/dashboard"
            className="mt-6 inline-flex rounded-xl bg-[#002451] px-6 py-3 text-sm font-bold text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const isConfirmed =
    booking.status.toLowerCase() ===
    "confirmed";

  const paymentSuccessful =
    booking.paymentStatus.toLowerCase() ===
    "successful";

  const hasTicket =
    Boolean(booking.ticketId) &&
    Boolean(booking.ticketNumber);

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-16">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#e7e7ed] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/passenger/dashboard">
            <Image
              src="/zano.webp"
              alt="Zano"
              width={115}
              height={45}
              priority
              className="h-auto w-[105px]"
            />
          </Link>

          <Link
            href="/passenger/dashboard"
            className="text-sm font-semibold text-[#002451]"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* ========================================
            Back
        ======================================== */}

        <Link
          href="/passenger/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#002451]"
        >
          <span aria-hidden="true">
            ←
          </span>
          Back to dashboard
        </Link>

        {/* ========================================
            Booking Heading
        ======================================== */}

        <section className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ff7417]">
              Booking Details
            </p>

            <h1 className="mt-2 text-3xl font-bold text-[#002451] sm:text-4xl">
              {booking.origin}{" "}
              <span className="text-[#ff7417]">
                →
              </span>{" "}
              {booking.destination}
            </h1>

            <p className="mt-2 text-sm text-[#747680]">
              Booking reference:{" "}
              <span className="font-bold text-[#002451]">
                {booking.bookingReference ||
                  booking.id}
              </span>
            </p>
          </div>

          <StatusBadge
            status={booking.status}
          />
        </section>

        {/* ========================================
            Main Grid
        ======================================== */}

        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {/* ========================================
                Journey Card
            ======================================== */}

            <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
              <div className="bg-[#002451] px-6 py-5 text-white sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
                      Your Journey
                    </p>

                    <h2 className="mt-1 text-lg font-bold">
                      {booking.companyName ||
                        "Zano Partner"}
                    </h2>
                  </div>

                  {booking.busType && (
                    <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold">
                      {booking.busType}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-6 py-7 sm:px-7">
                {/* Route */}

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                      From
                    </p>

                    <p className="mt-1 text-xl font-bold text-[#002451]">
                      {booking.origin}
                    </p>

                    <p className="mt-1 text-sm text-[#747680]">
                      {formatTime(
                        booking.departureAt
                      )}
                    </p>
                  </div>

                  <div className="flex min-w-[80px] items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff7417]" />

                    <div className="h-px flex-1 border-t border-dashed border-[#c5c7cf]" />

                    <span className="px-2 text-[#ff7417]">
                      →
                    </span>

                    <div className="h-px flex-1 border-t border-dashed border-[#c5c7cf]" />

                    <div className="h-2.5 w-2.5 rounded-full bg-[#002451]" />
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                      To
                    </p>

                    <p className="mt-1 text-xl font-bold text-[#002451]">
                      {booking.destination}
                    </p>

                    <p className="mt-1 text-sm text-[#747680]">
                      {formatTime(
                        booking.arrivalAt
                      )}
                    </p>
                  </div>
                </div>

                {/* Journey Details */}

                <div className="mt-7 grid grid-cols-2 gap-5 border-t border-[#eeeeF2] pt-6 sm:grid-cols-4">
                  <Info
                    label="Travel Date"
                    value={formatDate(
                      booking.departureAt
                    )}
                  />

                  <Info
                    label="Departure"
                    value={formatTime(
                      booking.departureAt
                    )}
                  />

                  <Info
                    label="Arrival"
                    value={formatTime(
                      booking.arrivalAt
                    )}
                  />

                  <Info
                    label="Passengers"
                    value={String(
                      booking.passengerCount
                    )}
                  />
                </div>
              </div>
            </section>

            {/* ========================================
                Passenger & Seat Details
            ======================================== */}

            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#ff7417]">
                  Travellers
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#002451]">
                  Passenger & Seat Details
                </h2>
              </div>

              <div className="mt-5 divide-y divide-[#eeeeF2]">
                {booking.passengers.length >
                0 ? (
                  booking.passengers.map(
                    (passenger, index) => (
                      <div
                        key={
                          passenger.seatId ||
                          `${passenger.fullName}-${index}`
                        }
                        className="flex items-center justify-between gap-5 py-5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-[#002451]">
                            {passenger.fullName ||
                              `Passenger ${
                                index + 1
                              }`}
                          </p>

                          {passenger.phoneNumber && (
                            <p className="mt-1 text-sm text-[#747680]">
                              {
                                passenger.phoneNumber
                              }
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 rounded-xl bg-[#fff1e7] px-5 py-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9a5a2c]">
                            Seat
                          </p>

                          <p className="mt-0.5 font-bold text-[#ff7417]">
                            {passenger.seatNumber ||
                              "—"}
                          </p>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-5">
                    <Info
                      label="Passengers"
                      value={String(
                        booking.passengerCount
                      )}
                    />

                    <Info
                      label="Seats"
                      value={
                        booking.seatNumbers.join(
                          ", "
                        ) || "—"
                      }
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ========================================
                Contact Details
            ======================================== */}

            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#ff7417]">
                Contact
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#002451]">
                Booking Contact
              </h2>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Info
                  label="Email"
                  value={
                    booking.contactEmail ||
                    "—"
                  }
                />

                <Info
                  label="Phone"
                  value={
                    booking.contactPhone ||
                    "—"
                  }
                />
              </div>
            </section>

            {/* ========================================
                References
            ======================================== */}

            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#ff7417]">
                References
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#002451]">
                Booking Information
              </h2>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Info
                  label="Booking Reference"
                  value={
                    booking.bookingReference ||
                    booking.id
                  }
                />

                <Info
                  label="Ticket Number"
                  value={
                    booking.ticketNumber ||
                    "—"
                  }
                />

                <Info
                  label="Payment Reference"
                  value={
                    booking.paymentReference ||
                    "—"
                  }
                />

                <Info
                  label="Booked On"
                  value={formatDateTime(
                    booking.createdAt
                  )}
                />
              </div>
            </section>
          </div>

          {/* ========================================
              Right Column
          ======================================== */}

          <aside className="space-y-6">
            {/* ========================================
                Payment Summary
            ======================================== */}

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#002451]">
                Payment Summary
              </h2>

              <div className="mt-5 space-y-4">
                <MoneyRow
                  label={`Fare × ${booking.passengerCount}`}
                  value={booking.subtotal}
                  currency={booking.currency}
                />

                <MoneyRow
                  label="Booking Fee"
                  value={booking.bookingFee}
                  currency={booking.currency}
                />

                <div className="border-t border-[#eeeeF2] pt-4">
                  <MoneyRow
                    label="Total Paid"
                    value={booking.totalAmount}
                    currency={booking.currency}
                    strong
                  />
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-[#f8f7ff] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#747680]">
                    Payment
                  </span>

                  <PaymentBadge
                    status={
                      booking.paymentStatus
                    }
                  />
                </div>

                {booking.paymentMethod && (
                  <p className="mt-3 text-sm font-semibold capitalize text-[#002451]">
                    {formatPaymentMethod(
                      booking.paymentMethod
                    )}
                  </p>
                )}

                {booking.paidAt && (
                  <p className="mt-1 text-xs text-[#747680]">
                    Paid{" "}
                    {formatDateTime(
                      booking.paidAt
                    )}
                  </p>
                )}
              </div>
            </section>

            {/* ========================================
                Booking Actions
            ======================================== */}

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#002451]">
                Manage Booking
              </h2>

              <div className="mt-5 space-y-3">
                {isConfirmed &&
                  paymentSuccessful &&
                  hasTicket && (
                    <Link
                      href={`/passenger/bookings/${booking.id}/ticket`}
                      className="flex w-full items-center justify-center rounded-xl bg-[#ff7417] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#e96208]"
                    >
                      View Digital Ticket
                    </Link>
                  )}

                {paymentSuccessful && (
                  <Link
                    href={`/passenger/bookings/${booking.id}/receipt`}
                    className="flex w-full items-center justify-center rounded-xl border border-[#002451] bg-white px-5 py-3.5 text-sm font-bold text-[#002451] transition hover:bg-[#f8fafc]"
                  >
                    View Payment Receipt
                  </Link>
                )}

                <Link
                  href={`/passenger/bookings/${booking.id}/confirmation`}
                  className="flex w-full items-center justify-center rounded-xl border border-[#d7d8df] bg-white px-5 py-3.5 text-sm font-bold text-[#002451] transition hover:bg-[#f8fafc]"
                >
                  Booking Confirmation
                </Link>

                {/* Cancellation backend is not built yet. */}

                <button
                  type="button"
                  disabled
                  title="Booking cancellation will be available once the cancellation service is enabled."
                  className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-[#eeeeF2] px-5 py-3.5 text-sm font-bold text-[#92959f]"
                >
                  Cancel Booking — Coming Soon
                </button>
              </div>
            </section>

            {/* ========================================
                Tracking
            ======================================== */}

            <section className="rounded-3xl bg-[#002451] p-6 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#39b5f4]">
                Journey Tracking
              </p>

              <h2 className="mt-2 text-xl font-bold">
                Track your bus
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/70">
                Live trip tracking will
                become available when the
                operator starts your
                journey.
              </p>

              {/* Tracking backend is not built yet. */}

              <button
                type="button"
                disabled
                className="mt-5 w-full cursor-not-allowed rounded-xl bg-white/10 px-5 py-3.5 text-sm font-bold text-white/50"
              >
                Live Tracking — Coming Soon
              </button>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

/* ========================================
   Information Field
======================================== */

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#92959f]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-bold text-[#002451]">
        {value || "—"}
      </p>
    </div>
  );
}

/* ========================================
   Booking Status Badge
======================================== */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let classes =
    "bg-[#f3f4f6] text-[#6b7280]";

  if (normalized === "confirmed") {
    classes =
      "bg-[#e9f8ef] text-[#15803d]";
  } else if (
    normalized === "cancelled"
  ) {
    classes =
      "bg-[#feecec] text-[#b42318]";
  } else if (
    normalized === "completed"
  ) {
    classes =
      "bg-[#eaf4ff] text-[#175cd3]";
  } else if (
    normalized === "pending"
  ) {
    classes =
      "bg-[#fff4e5] text-[#b54708]";
  } else if (
    normalized === "expired"
  ) {
    classes =
      "bg-[#f3f4f6] text-[#667085]";
  }

  return (
    <span
      className={`inline-flex w-fit rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide ${classes}`}
    >
      {status || "Unknown"}
    </span>
  );
}

/* ========================================
   Payment Status Badge
======================================== */

function PaymentBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  const successful =
    normalized === "successful" ||
    normalized === "paid";

  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
        successful
          ? "bg-[#e9f8ef] text-[#15803d]"
          : "bg-[#fff4e5] text-[#b54708]"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
}

/* ========================================
   Money Row
======================================== */

function MoneyRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span
        className={
          strong
            ? "font-bold text-[#002451]"
            : "text-sm text-[#747680]"
        }
      >
        {label}
      </span>

      <span
        className={
          strong
            ? "text-lg font-bold text-[#002451]"
            : "text-sm font-bold text-[#002451]"
        }
      >
        {formatMoney(
          value,
          currency
        )}
      </span>
    </div>
  );
}

/* ========================================
   Error Helper
======================================== */

function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "We could not load your booking.";
}

/* ========================================
   Date Parser
======================================== */

function parseDate(
  value: string | null
): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

/* ========================================
   Date Formatter
======================================== */

function formatDate(
  value: string | null
): string {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Accra",
    }
  ).format(date);
}

/* ========================================
   Time Formatter
======================================== */

function formatTime(
  value: string | null
): string {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Accra",
    }
  ).format(date);
}

/* ========================================
   Date + Time Formatter
======================================== */

function formatDateTime(
  value: string | null
): string {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }
  ).format(date);
}

/* ========================================
   Money Formatter
======================================== */

function formatMoney(
  amount: number,
  currency = "GHS"
): string {
  try {
    return new Intl.NumberFormat(
      "en-GH",
      {
        style: "currency",
        currency:
          currency || "GHS",
        minimumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `GH₵${amount.toFixed(
      2
    )}`;
  }
}

/* ========================================
   Payment Method Formatter
======================================== */

function formatPaymentMethod(
  value: string
): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}