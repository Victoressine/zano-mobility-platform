"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import {useParams, useRouter} from "next/navigation";
import {useEffect, useState} from "react";

import {
  DocumentData,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";

import {onAuthStateChanged} from "firebase/auth";

import {auth, db} from "@/lib/firebase/client";

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

  userId: string;
  tripId: string;

  companyName: string;
  busType: string;

  origin: string;
  destination: string;

  departureAt: unknown;
  arrivalAt: unknown;

  passengerCount: number;
  passengers: BookingPassenger[];

  seatNumbers: string[];

  fare: number;
  subtotal: number;
  bookingFee: number;
  totalAmount: number;

  currency: string;

  status: string;

  paymentStatus: string;
  paymentMethod: string;

  paymentReference: string;

  contactEmail: string;
  contactPhone: string;

  confirmedAt: unknown;
  paidAt: unknown;
};

/* ========================================
   Booking Confirmation Page
======================================== */

export default function BookingConfirmationPage() {
  const router = useRouter();
  const params = useParams();

  const bookingId =
    typeof params.bookingId === "string"
      ? params.bookingId
      : "";

  /* ========================================
     State
  ======================================== */

  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* ========================================
     Authentication + Booking
  ======================================== */

  useEffect(() => {
    let active = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (currentUser) => {
          if (!currentUser) {
            const returnUrl =
              encodeURIComponent(
                window.location.pathname
              );

            router.replace(
              `/login?returnUrl=${returnUrl}`
            );

            return;
          }

          if (!bookingId) {
            if (active) {
              setError(
                "The booking reference is missing."
              );

              setLoading(false);
            }

            return;
          }

          try {
            const bookingSnapshot =
              await getDoc(
                doc(
                  db,
                  "bookings",
                  bookingId
                )
              );

            if (!active) {
              return;
            }

            if (
              !bookingSnapshot.exists()
            ) {
              setError(
                "We could not find this booking."
              );

              setLoading(false);

              return;
            }

            const data =
              bookingSnapshot.data();

            /*
             * Firestore rules protect the
             * document as well, but we still
             * validate ownership in the UI.
             */
            if (
              data.userId !==
              currentUser.uid
            ) {
              setError(
                "You do not have permission to view this booking."
              );

              setLoading(false);

              return;
            }

            setBooking(
              mapBooking(
                bookingSnapshot.id,
                data
              )
            );

            setError("");
          } catch (bookingError) {
            console.error(
              "Booking confirmation error:",
              bookingError
            );

            if (active) {
              setError(
                "We could not load your booking confirmation."
              );
            }
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        }
      );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bookingId, router]);

  /* ========================================
     Loading
  ======================================== */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f7ff]">
        <div className="flex min-h-[75vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

            <p className="mt-4 text-sm font-medium text-[#747680]">
              Loading your booking...
            </p>
          </div>
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
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
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

  const paymentSuccessful =
    booking.status === "confirmed" &&
    booking.paymentStatus ===
      "successful";

  /* ========================================
     Confirmation UI
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-16">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#e7e7ed] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link
            href="/passenger/dashboard"
            className="flex items-center"
          >
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

      <div className="mx-auto max-w-3xl px-5 py-10">
        {/* ========================================
            Success
        ======================================== */}

        <section className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e9f8ef]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-10 w-10 text-[#15803d]"
              aria-hidden="true"
            >
              <path
                d="M5 12.5 9.2 17 19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#ff7417]">
            Booking confirmed
          </p>

          <h1 className="mt-2 text-3xl font-bold text-[#002451] sm:text-4xl">
            Your trip is confirmed!
          </h1>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#747680]">
            Your demo payment was successful and
            your selected seats are now booked.
          </p>
        </section>

        {/* ========================================
            Booking Reference
        ======================================== */}

        <section className="mt-9 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="bg-[#002451] px-6 py-5 text-white sm:px-8">
            <p className="text-xs font-medium text-white/65">
              Booking Reference
            </p>

            <p className="mt-1 text-xl font-bold tracking-wide">
              {booking.bookingReference}
            </p>
          </div>

          {/* ========================================
              Route
          ======================================== */}

          <div className="px-6 py-7 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                  From
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#002451]">
                  {booking.origin}
                </h2>
              </div>

              <div className="flex flex-1 items-center">
                <div className="h-2 w-2 rounded-full bg-[#ff7417]" />

                <div className="h-px flex-1 border-t border-dashed border-[#b8bac4]" />

                <span className="px-2 text-[#ff7417]">
                  →
                </span>

                <div className="h-px flex-1 border-t border-dashed border-[#b8bac4]" />

                <div className="h-2 w-2 rounded-full bg-[#002451]" />
              </div>

              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                  To
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#002451]">
                  {booking.destination}
                </h2>
              </div>
            </div>

            {/* ========================================
                Journey Information
            ======================================== */}

            <div className="mt-7 grid gap-4 border-t border-[#eeeeF2] pt-6 sm:grid-cols-2">
              <InfoItem
                label="Departure"
                value={formatDateTime(
                  booking.departureAt
                )}
              />

              <InfoItem
                label="Arrival"
                value={formatDateTime(
                  booking.arrivalAt
                )}
              />

              <InfoItem
                label="Transport Company"
                value={
                  booking.companyName ||
                  "Zano Partner"
                }
              />

              <InfoItem
                label="Bus"
                value={
                  booking.busType ||
                  "Coach"
                }
              />
            </div>
          </div>
        </section>

        {/* ========================================
            Passenger Seats
        ======================================== */}

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ff7417]">
                Passengers
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#002451]">
                Passenger & Seat Details
              </h2>
            </div>

            <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-bold text-[#002451]">
              {booking.passengerCount}
            </span>
          </div>

          <div className="mt-5 divide-y divide-[#eeeeF2]">
            {booking.passengers.map(
              (passenger, index) => (
                <div
                  key={`${passenger.seatId}-${index}`}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div>
                    <p className="font-bold text-[#002451]">
                      {passenger.fullName}
                    </p>

                    {passenger.phoneNumber && (
                      <p className="mt-1 text-xs text-[#747680]">
                        {
                          passenger.phoneNumber
                        }
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-[#fff1e7] px-4 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase text-[#9a5a2c]">
                      Seat
                    </p>

                    <p className="text-sm font-bold text-[#ff7417]">
                      {
                        passenger.seatNumber
                      }
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* ========================================
            Payment Summary
        ======================================== */}

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ff7417]">
                Payment
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#002451]">
                Payment Summary
              </h2>
            </div>

            <span className="rounded-full bg-[#e9f8ef] px-3 py-1 text-xs font-bold text-[#15803d]">
              Successful
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <SummaryRow
              label="Fare"
              value={`${formatMoney(
                booking.fare,
                booking.currency
              )} × ${
                booking.passengerCount
              }`}
            />

            <SummaryRow
              label="Subtotal"
              value={formatMoney(
                booking.subtotal,
                booking.currency
              )}
            />

            <SummaryRow
              label="Booking fee"
              value={formatMoney(
                booking.bookingFee,
                booking.currency
              )}
            />

            <div className="border-t border-[#eeeeF2] pt-4">
              <SummaryRow
                label="Total paid"
                value={formatMoney(
                  booking.totalAmount,
                  booking.currency
                )}
                strong
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#f8f7ff] p-4">
            <InfoItem
              label="Payment Reference"
              value={
                booking.paymentReference
              }
            />

            <div className="mt-4">
              <InfoItem
                label="Payment Method"
                value="Demo Payment"
              />
            </div>

            <div className="mt-4">
              <InfoItem
                label="Payment Date"
                value={formatDateTime(
                  booking.paidAt
                )}
              />
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] leading-5 text-[#92959f]">
            This transaction was completed using
            Zano&apos;s demo payment environment.
            No real money was charged.
          </p>
        </section>

        {/* ========================================
            Actions
        ======================================== */}

        <section className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/passenger/bookings/${booking.id}/ticket`}
            className="flex items-center justify-center rounded-xl bg-[#ff7417] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#e96208]"
          >
            View Digital Ticket
          </Link>

          <Link
            href={`/passenger/bookings/${booking.id}/receipt`}
            className="flex items-center justify-center rounded-xl border border-[#002451] bg-white px-5 py-4 text-sm font-bold text-[#002451] transition hover:bg-[#f8fafc]"
          >
            View Payment Receipt
          </Link>
        </section>

        <Link
          href="/passenger/dashboard"
          className="mt-4 flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-[#747680] transition hover:text-[#002451]"
        >
          Back to Dashboard
        </Link>

        {!paymentSuccessful && (
          <p className="mt-4 text-center text-xs text-red-600">
            This booking does not have a
            confirmed successful payment.
          </p>
        )}
      </div>
    </main>
  );
}

/* ========================================
   Info Item
======================================== */

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#92959f]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#002451]">
        {value || "—"}
      </p>
    </div>
  );
}

/* ========================================
   Summary Row
======================================== */

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
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
            : "text-sm font-semibold text-[#002451]"
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ========================================
   Firestore Booking Mapper
======================================== */

function mapBooking(
  id: string,
  data: DocumentData
): Booking {
  const passengers =
    Array.isArray(data.passengers)
      ? data.passengers.map(
          (passenger: DocumentData) => ({
            fullName:
              typeof passenger.fullName ===
              "string"
                ? passenger.fullName
                : "",

            phoneNumber:
              typeof passenger.phoneNumber ===
              "string"
                ? passenger.phoneNumber
                : "",

            seatId:
              typeof passenger.seatId ===
              "string"
                ? passenger.seatId
                : "",

            seatNumber:
              typeof passenger.seatNumber ===
              "string"
                ? passenger.seatNumber
                : "",
          })
        )
      : [];

  return {
    id,

    bookingReference:
      stringValue(
        data.bookingReference
      ),

    userId:
      stringValue(data.userId),

    tripId:
      stringValue(data.tripId),

    companyName:
      stringValue(
        data.companyName
      ),

    busType:
      stringValue(data.busType),

    origin:
      stringValue(data.origin),

    destination:
      stringValue(
        data.destination
      ),

    departureAt:
      data.departureAt ?? null,

    arrivalAt:
      data.arrivalAt ?? null,

    passengerCount:
      numberValue(
        data.passengerCount
      ),

    passengers,

    seatNumbers:
      Array.isArray(
        data.seatNumbers
      )
        ? data.seatNumbers.filter(
            (
              value: unknown
            ): value is string =>
              typeof value ===
              "string"
          )
        : [],

    fare:
      numberValue(data.fare),

    subtotal:
      numberValue(
        data.subtotal
      ),

    bookingFee:
      numberValue(
        data.bookingFee
      ),

    totalAmount:
      numberValue(
        data.totalAmount
      ),

    currency:
      stringValue(
        data.currency
      ) || "GHS",

    status:
      stringValue(data.status),

    paymentStatus:
      stringValue(
        data.paymentStatus
      ),

    paymentMethod:
      stringValue(
        data.paymentMethod
      ),

    paymentReference:
      stringValue(
        data.paymentReference
      ),

    contactEmail:
      stringValue(
        data.contactEmail
      ),

    contactPhone:
      stringValue(
        data.contactPhone
      ),

    confirmedAt:
      data.confirmedAt ?? null,

    paidAt:
      data.paidAt ?? null,
  };
}

/* ========================================
   String Helper
======================================== */

function stringValue(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : "";
}

/* ========================================
   Number Helper
======================================== */

function numberValue(
  value: unknown
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

/* ========================================
   Date Formatter
======================================== */

function formatDateTime(
  value: unknown
) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

/* ========================================
   Firestore Date Helper
======================================== */

function toDate(
  value: unknown
): Date | null {
  if (
    value instanceof Timestamp
  ) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value;
  }

  if (
    typeof value === "string"
  ) {
    const date = new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    try {
      return (
        value as {
          toDate: () => Date;
        }
      ).toDate();
    } catch {
      return null;
    }
  }

  return null;
}

/* ========================================
   Money Formatter
======================================== */

function formatMoney(
  amount: number,
  currency = "GHS"
) {
  return new Intl.NumberFormat(
    "en-GH",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }
  ).format(amount);
}