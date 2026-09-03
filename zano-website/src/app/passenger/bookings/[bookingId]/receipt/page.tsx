"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import {useParams, useRouter} from "next/navigation";
import {useEffect, useState} from "react";

import {onAuthStateChanged} from "firebase/auth";

import {auth} from "@/lib/firebase/client";

/* ========================================
   Types
======================================== */

type ReceiptPassenger = {
  fullName: string;
  phoneNumber: string;
  seatNumber: string;
};

type Receipt = {
  receiptNumber: string;

  bookingId: string;
  bookingReference: string;

  paymentId: string;
  paymentReference: string;

  tripId: string;

  companyName: string;
  origin: string;
  destination: string;
  busType: string;
  departureAt: string | null;

  passengerCount: number;
  passengers: ReceiptPassenger[];
  seatNumbers: string[];

  contactEmail: string;
  contactPhone: string;

  fare: number;
  subtotal: number;
  bookingFee: number;
  totalAmount: number;
  currency: string;

  paymentMethod: string;
  paymentProvider: string;
  paymentStatus: string;
  isDemo: boolean;
  paidAt: string | null;

  bookingStatus: string;
  confirmedAt: string | null;
  createdAt: string | null;
};

type ReceiptResponse = {
  success: boolean;
  receipt?: Receipt;
  error?: string;
};

/* ========================================
   Receipt Page
======================================== */

export default function ReceiptPage() {
  const router = useRouter();
  const params = useParams();

  const bookingId =
    typeof params.bookingId === "string"
      ? params.bookingId
      : "";

  /* ========================================
     State
  ======================================== */

  const [receipt, setReceipt] =
    useState<Receipt | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* ========================================
     Load Secure Receipt
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
            /*
             * Send the Firebase ID token to
             * the secure server-side receipt API.
             */
            const idToken =
              await currentUser.getIdToken();

            const response =
              await fetch(
                `/api/bookings/${encodeURIComponent(
                  bookingId
                )}/receipt`,
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
              (await response.json()) as ReceiptResponse;

            if (!active) {
              return;
            }

            if (
              !response.ok ||
              !data.success ||
              !data.receipt
            ) {
              setError(
                data.error ||
                  "We could not load your payment receipt."
              );

              setLoading(false);

              return;
            }

            setReceipt(
              data.receipt
            );

            setError("");
          } catch (receiptError) {
            console.error(
              "Receipt loading error:",
              receiptError
            );

            if (active) {
              setError(
                "We could not load your payment receipt."
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
        <div className="flex min-h-[75vh] items-center justify-center px-5">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

            <p className="mt-4 text-sm font-medium text-[#747680]">
              Preparing your receipt...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* ========================================
     Error
  ======================================== */

  if (error || !receipt) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-xl font-bold text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Receipt unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#747680]">
            {error ||
              "We could not load this receipt."}
          </p>

          <Link
            href={
              bookingId
                ? `/passenger/bookings/${bookingId}/confirmation`
                : "/passenger/dashboard"
            }
            className="mt-6 inline-flex rounded-xl bg-[#002451] px-6 py-3 text-sm font-bold text-white"
          >
            Back
          </Link>
        </div>
      </main>
    );
  }

  /* ========================================
     Receipt UI
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-16">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#e7e7ed] bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link
            href={`/passenger/bookings/${bookingId}/confirmation`}
            className="text-sm font-semibold text-[#002451]"
          >
            ← Back
          </Link>

          <Image
            src="/zano.webp"
            alt="Zano"
            width={110}
            height={44}
            priority
            className="h-auto w-[100px]"
          />

          <Link
            href="/passenger/dashboard"
            className="text-sm font-semibold text-[#002451]"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-10 print:max-w-none print:px-0 print:py-0">
        {/* ========================================
            Receipt Card
        ======================================== */}

        <article className="overflow-hidden rounded-3xl bg-white shadow-sm print:rounded-none print:shadow-none">
          {/* ========================================
              Receipt Header
          ======================================== */}

          <div className="border-b border-[#eeeeF2] px-6 py-7 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Image
                  src="/zano.webp"
                  alt="Zano"
                  width={125}
                  height={50}
                  className="h-auto w-[115px]"
                />

                <p className="mt-4 text-sm font-medium text-[#747680]">
                  Payment Receipt
                </p>
              </div>

              <div className="sm:text-right">
                <span className="inline-flex rounded-full bg-[#e9f8ef] px-3 py-1 text-xs font-bold text-[#15803d]">
                  Payment Successful
                </span>

                <p className="mt-3 text-xs text-[#92959f]">
                  Receipt Number
                </p>

                <p className="mt-1 font-bold text-[#002451]">
                  {receipt.receiptNumber}
                </p>
              </div>
            </div>
          </div>

          {/* ========================================
              Amount Paid
          ======================================== */}

          <div className="bg-[#002451] px-6 py-7 text-white sm:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-white/60">
              Total Paid
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatMoney(
                receipt.totalAmount,
                receipt.currency
              )}
            </p>

            <p className="mt-2 text-xs text-white/65">
              Paid{" "}
              {formatDateTime(
                receipt.paidAt
              )}
            </p>
          </div>

          {/* ========================================
              References
          ======================================== */}

          <section className="px-6 py-7 sm:px-8">
            <SectionTitle>
              Transaction Details
            </SectionTitle>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <ReceiptItem
                label="Booking Reference"
                value={
                  receipt.bookingReference
                }
              />

              <ReceiptItem
                label="Payment Reference"
                value={
                  receipt.paymentReference
                }
              />

              <ReceiptItem
                label="Payment Method"
                value={
                  receipt.isDemo
                    ? "Demo Payment"
                    : capitalize(
                        receipt.paymentMethod
                      )
                }
              />

              <ReceiptItem
                label="Payment Status"
                value={capitalize(
                  receipt.paymentStatus
                )}
              />
            </div>
          </section>

          {/* ========================================
              Journey
          ======================================== */}

          <section className="border-t border-[#eeeeF2] px-6 py-7 sm:px-8">
            <SectionTitle>
              Journey Details
            </SectionTitle>

            <div className="mt-5 rounded-2xl bg-[#f8f7ff] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#92959f]">
                    From
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#002451]">
                    {receipt.origin}
                  </p>
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
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#92959f]">
                    To
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#002451]">
                    {receipt.destination}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-[#e4e5eb] pt-5 sm:grid-cols-2">
                <ReceiptItem
                  label="Transport Company"
                  value={
                    receipt.companyName ||
                    "Zano Partner"
                  }
                />

                <ReceiptItem
                  label="Bus"
                  value={
                    receipt.busType ||
                    "Coach"
                  }
                />

                <ReceiptItem
                  label="Departure"
                  value={formatDateTime(
                    receipt.departureAt
                  )}
                />

                <ReceiptItem
                  label="Seats"
                  value={
                    receipt.seatNumbers.join(
                      ", "
                    ) || "—"
                  }
                />
              </div>
            </div>
          </section>

          {/* ========================================
              Passenger Information
          ======================================== */}

          <section className="border-t border-[#eeeeF2] px-6 py-7 sm:px-8">
            <SectionTitle>
              Passenger Details
            </SectionTitle>

            <div className="mt-4 divide-y divide-[#eeeeF2]">
              {receipt.passengers.map(
                (passenger, index) => (
                  <div
                    key={`${passenger.seatNumber}-${index}`}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#002451]">
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
                      <p className="text-[10px] font-bold uppercase text-[#9a5a2c]">
                        Seat
                      </p>

                      <p className="text-sm font-bold text-[#ff7417]">
                        {passenger.seatNumber}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          {/* ========================================
              Payment Breakdown
          ======================================== */}

          <section className="border-t border-[#eeeeF2] px-6 py-7 sm:px-8">
            <SectionTitle>
              Payment Breakdown
            </SectionTitle>

            <div className="mt-5 space-y-4">
              <AmountRow
                label={`Fare × ${receipt.passengerCount}`}
                value={formatMoney(
                  receipt.subtotal,
                  receipt.currency
                )}
              />

              <AmountRow
                label="Booking Fee"
                value={formatMoney(
                  receipt.bookingFee,
                  receipt.currency
                )}
              />

              <div className="border-t border-[#eeeeF2] pt-4">
                <AmountRow
                  label="Total Paid"
                  value={formatMoney(
                    receipt.totalAmount,
                    receipt.currency
                  )}
                  strong
                />
              </div>
            </div>
          </section>

          {/* ========================================
              Contact
          ======================================== */}

          <section className="border-t border-[#eeeeF2] px-6 py-7 sm:px-8">
            <SectionTitle>
              Booking Contact
            </SectionTitle>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <ReceiptItem
                label="Email"
                value={
                  receipt.contactEmail ||
                  "—"
                }
              />

              <ReceiptItem
                label="Phone"
                value={
                  receipt.contactPhone ||
                  "—"
                }
              />
            </div>
          </section>

          {/* ========================================
              Demo Notice
          ======================================== */}

          {receipt.isDemo && (
            <div className="border-t border-[#eeeeF2] bg-[#fff8f2] px-6 py-5 text-center sm:px-8">
              <p className="text-xs leading-5 text-[#8a5a38]">
                This receipt was generated from
                Zano&apos;s demo payment
                environment. No real money was
                charged.
              </p>
            </div>
          )}

          {/* ========================================
              Footer
          ======================================== */}

          <footer className="border-t border-[#eeeeF2] px-6 py-6 text-center sm:px-8">
            <p className="text-xs font-semibold text-[#002451]">
              RIDE. CONNECT. GO.
            </p>

            <p className="mt-2 text-[11px] leading-5 text-[#92959f]">
              Thank you for booking with Zano.
              Keep this receipt for your records.
            </p>
          </footer>
        </article>

        {/* ========================================
            Actions
        ======================================== */}

        <div className="mt-6 grid gap-3 print:hidden sm:grid-cols-2">
          <Link
            href={`/passenger/bookings/${bookingId}/confirmation`}
            className="flex items-center justify-center rounded-xl border border-[#002451] bg-white px-5 py-4 text-sm font-bold text-[#002451]"
          >
            Booking Confirmation
          </Link>

          <Link
            href={`/passenger/bookings/${bookingId}/ticket`}
            className="flex items-center justify-center rounded-xl bg-[#ff7417] px-5 py-4 text-sm font-bold text-white"
          >
            View Digital Ticket
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ========================================
   Section Title
======================================== */

function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h2 className="text-base font-bold text-[#002451]">
      {children}
    </h2>
  );
}

/* ========================================
   Receipt Item
======================================== */

function ReceiptItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#92959f]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#002451]">
        {value || "—"}
      </p>
    </div>
  );
}

/* ========================================
   Amount Row
======================================== */

function AmountRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
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

/* ========================================
   Date Formatter
======================================== */

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
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
   Capitalize Helper
======================================== */

function capitalize(
  value: string
) {
  if (!value) {
    return "—";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}