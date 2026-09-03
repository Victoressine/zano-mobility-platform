"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import QRCode from "qrcode";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase/client";

/* ========================================
   Types
======================================== */

type Passenger = {
  fullName: string;
  phoneNumber: string;
  seatId: string;
  seatNumber: string;
};

type Ticket = {
  id: string;
  ticketNumber: string;
  status: string;

  bookingId: string;
  bookingReference: string;

  paymentId: string;
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
  passengers: Passenger[];
  seatNumbers: string[];

  fare: number;
  subtotal: number;
  bookingFee: number;
  totalAmount: number;
  currency: string;

  paymentStatus: string;
  issuedAt: string | null;
};

type TicketResponse = {
  ticket?: Ticket;
  qrPayload?: string;
  error?: string;
};

/* ========================================
   Digital Ticket Page
======================================== */

export default function DigitalTicketPage() {
  const router = useRouter();

  const params = useParams<{
    bookingId: string;
  }>();

  const bookingId =
    typeof params.bookingId === "string"
      ? params.bookingId
      : "";

  const [ticket, setTicket] =
    useState<Ticket | null>(null);

  const [qrCode, setQrCode] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [shareMessage, setShareMessage] =
    useState("");

  /* ========================================
     Load Authoritative Ticket
  ======================================== */

  const loadTicket = useCallback(
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
        )}/ticket`,
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
          TicketResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "We could not load your digital ticket."
        );
      }

      if (
        !data.ticket ||
        !data.qrPayload
      ) {
        throw new Error(
          "The ticket response is incomplete."
        );
      }

      /* ========================================
         Generate QR Code
      ======================================== */

      const qrDataUrl =
        await QRCode.toDataURL(
          data.qrPayload,
          {
            width: 420,
            margin: 2,
            errorCorrectionLevel: "H",
          }
        );

      setTicket(data.ticket);
      setQrCode(qrDataUrl);
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
              `/passenger/bookings/${bookingId}/ticket`;

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

            await loadTicket(user);
          } catch (loadError) {
            console.error(
              "Digital ticket error:",
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
    loadTicket,
    router,
  ]);

  /* ========================================
     Share Ticket
  ======================================== */

  async function handleShare() {
    if (!ticket) {
      return;
    }

    setShareMessage("");

    const shareText = [
      "Zano Digital Ticket",
      `${ticket.origin} → ${ticket.destination}`,
      `Ticket: ${ticket.ticketNumber}`,
      `Booking: ${ticket.bookingReference}`,
      `Seat${
        ticket.seatNumbers.length > 1
          ? "s"
          : ""
      }: ${ticket.seatNumbers.join(", ")}`,
      `Departure: ${formatDateTime(
        ticket.departureAt
      )}`,
    ].join("\n");

    try {
      if (
        typeof navigator !==
          "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title: "Zano Digital Ticket",
          text: shareText,
        });

        setShareMessage(
          "Ticket shared successfully."
        );

        return;
      }

      if (
        typeof navigator !==
          "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(
          shareText
        );

        setShareMessage(
          "Ticket details copied."
        );

        return;
      }

      setShareMessage(
        "Sharing is not supported by this browser."
      );
    } catch (shareError) {
      if (
        shareError instanceof
          DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      console.error(
        "Ticket share error:",
        shareError
      );

      setShareMessage(
        "Unable to share the ticket."
      );
    }
  }

  /* ========================================
     Print / Save PDF
  ======================================== */

  function handlePrint() {
    window.print();
  }

  /* ========================================
     Loading State
  ======================================== */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#e5e7eb] border-t-[#ff7417]" />

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Loading your ticket
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#747680]">
            Verifying your booking and
            preparing your digital ticket.
          </p>
        </div>
      </main>
    );
  }

  /* ========================================
     Error State
  ======================================== */

  if (error || !ticket) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-xl font-bold text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Ticket unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#747680]">
            {error ||
              "We could not load your digital ticket."}
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

  /* ========================================
     Ticket UI
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-16 print:bg-white print:pb-0">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#e7e7ed] bg-white print:hidden">
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

      <div className="mx-auto max-w-3xl px-5 py-9 print:max-w-none print:p-0">
        {/* ========================================
            Page Heading
        ======================================== */}

        <section className="mb-7 text-center print:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff7417]">
            Ready to travel
          </p>

          <h1 className="mt-2 text-3xl font-bold text-[#002451] sm:text-4xl">
            Your Digital Ticket
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#747680]">
            Keep this ticket available
            when boarding. Your QR code
            identifies your confirmed
            Zano booking.
          </p>
        </section>

        {/* ========================================
            Ticket Card
        ======================================== */}

        <article className="overflow-hidden rounded-[30px] bg-white shadow-[0_20px_55px_rgba(0,36,81,0.10)] print:rounded-none print:shadow-none">
          {/* ========================================
              Ticket Header
          ======================================== */}

          <div className="bg-[#002451] px-6 py-6 text-white sm:px-8">
            <div className="flex items-center justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                  Digital Ticket
                </p>

                <p className="mt-2 text-lg font-bold">
                  {ticket.ticketNumber}
                </p>
              </div>

              <span className="rounded-full bg-[#e9f8ef] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#15803d]">
                Valid
              </span>
            </div>
          </div>

          {/* ========================================
              Route
          ======================================== */}

          <section className="px-6 pt-8 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                  From
                </p>

                <h2 className="mt-1 text-2xl font-bold text-[#002451]">
                  {ticket.origin}
                </h2>
              </div>

              <div className="flex min-w-[70px] flex-1 items-center">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff7417]" />

                <div className="h-px flex-1 border-t border-dashed border-[#b8bac4]" />

                <span className="px-2 text-lg text-[#ff7417]">
                  →
                </span>

                <div className="h-px flex-1 border-t border-dashed border-[#b8bac4]" />

                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#002451]" />
              </div>

              <div className="min-w-0 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#92959f]">
                  To
                </p>

                <h2 className="mt-1 text-2xl font-bold text-[#002451]">
                  {ticket.destination}
                </h2>
              </div>
            </div>

            {/* ========================================
                Journey Information
            ======================================== */}

            <div className="mt-7 grid grid-cols-2 gap-4 border-t border-[#eeeeF2] py-6 sm:grid-cols-4">
              <TicketInfo
                label="Travel Date"
                value={formatDate(
                  ticket.departureAt
                )}
              />

              <TicketInfo
                label="Departure"
                value={formatTime(
                  ticket.departureAt
                )}
              />

              <TicketInfo
                label="Arrival"
                value={formatTime(
                  ticket.arrivalAt
                )}
              />

              <TicketInfo
                label="Bus"
                value={
                  ticket.busType ||
                  "Coach"
                }
              />
            </div>
          </section>

          {/* ========================================
              Ticket Tear Line
          ======================================== */}

          <div className="relative flex items-center">
            <div className="-ml-4 h-8 w-8 rounded-full bg-[#f8f7ff] print:bg-white" />

            <div className="flex-1 border-t-2 border-dashed border-[#e3e4e9]" />

            <div className="-mr-4 h-8 w-8 rounded-full bg-[#f8f7ff] print:bg-white" />
          </div>

          {/* ========================================
              Boarding Pass + QR
          ======================================== */}

          <section className="px-6 py-8 sm:px-8">
            <div className="grid gap-8 md:grid-cols-[1fr_230px] md:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ff7417]">
                  Boarding Pass
                </p>

                <h3 className="mt-2 text-xl font-bold text-[#002451]">
                  {ticket.companyName ||
                    "Zano Partner"}
                </h3>

                <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
                  <TicketInfo
                    label="Booking Reference"
                    value={
                      ticket.bookingReference
                    }
                  />

                  <TicketInfo
                    label="Passengers"
                    value={String(
                      ticket.passengerCount
                    )}
                  />

                  <TicketInfo
                    label={
                      ticket.seatNumbers
                        .length > 1
                        ? "Seats"
                        : "Seat"
                    }
                    value={
                      ticket.seatNumbers.join(
                        ", "
                      ) || "—"
                    }
                  />

                  <TicketInfo
                    label="Amount Paid"
                    value={formatMoney(
                      ticket.totalAmount,
                      ticket.currency
                    )}
                  />
                </div>
              </div>

              {/* ========================================
                  QR Code
              ======================================== */}

              <div className="mx-auto text-center">
                {qrCode ? (
                  <Image
                    src={qrCode}
                    alt={`QR code for ticket ${ticket.ticketNumber}`}
                    width={210}
                    height={210}
                    unoptimized
                    className="mx-auto h-[210px] w-[210px]"
                  />
                ) : (
                  <div className="flex h-[210px] w-[210px] items-center justify-center rounded-xl bg-[#f8f7ff] text-xs text-[#747680]">
                    QR unavailable
                  </div>
                )}

                <p className="mt-2 text-[11px] font-semibold text-[#747680]">
                  Scan at boarding
                </p>
              </div>
            </div>
          </section>

          {/* ========================================
              Passenger Details
          ======================================== */}

          <section className="border-t border-[#eeeeF2] px-6 py-7 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ff7417]">
              Passenger Details
            </p>

            <div className="mt-4 divide-y divide-[#eeeeF2]">
              {ticket.passengers.map(
                (passenger, index) => (
                  <div
                    key={`${passenger.seatId}-${index}`}
                    className="flex items-center justify-between gap-5 py-4"
                  >
                    <div>
                      <p className="font-bold text-[#002451]">
                        {passenger.fullName ||
                          `Passenger ${
                            index + 1
                          }`}
                      </p>

                      {passenger.phoneNumber && (
                        <p className="mt-1 text-xs text-[#747680]">
                          {
                            passenger.phoneNumber
                          }
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl bg-[#fff1e7] px-5 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9a5a2c]">
                        Seat
                      </p>

                      <p className="mt-0.5 text-base font-bold text-[#ff7417]">
                        {passenger.seatNumber ||
                          "—"}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          {/* ========================================
              Ticket References
          ======================================== */}

          <section className="border-t border-[#eeeeF2] bg-[#fafafd] px-6 py-6 sm:px-8">
            <div className="grid gap-5 sm:grid-cols-3">
              <TicketInfo
                label="Ticket Number"
                value={
                  ticket.ticketNumber
                }
              />

              <TicketInfo
                label="Payment Reference"
                value={
                  ticket.paymentReference
                }
              />

              <TicketInfo
                label="Issued"
                value={formatDateTime(
                  ticket.issuedAt
                )}
              />
            </div>
          </section>
        </article>

        {/* ========================================
            Share Message
        ======================================== */}

        {shareMessage && (
          <p className="mt-4 text-center text-xs font-semibold text-[#15803d] print:hidden">
            {shareMessage}
          </p>
        )}

        {/* ========================================
            Ticket Actions
        ======================================== */}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 print:hidden">
          <button
            type="button"
            onClick={handleShare}
            className="rounded-xl bg-[#ff7417] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#e96208]"
          >
            Share Ticket
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl border border-[#002451] bg-white px-5 py-4 text-sm font-bold text-[#002451] transition hover:bg-[#f8fafc]"
          >
            Print / Save PDF
          </button>
        </section>

        {/* ========================================
            Live Tracking Placeholder
        ======================================== */}

        <button
          type="button"
          disabled
          className="mt-3 flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-[#e8e9ee] px-5 py-4 text-sm font-bold text-[#92959f] print:hidden"
        >
          Track Bus — Coming Soon
        </button>

        {/* ========================================
            Navigation
        ======================================== */}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 print:hidden">
          <Link
            href={`/passenger/bookings/${ticket.bookingId}/confirmation`}
            className="text-sm font-semibold text-[#002451] hover:underline"
          >
            Booking Confirmation
          </Link>

          <span className="text-[#c5c7cf]">
            •
          </span>

          <Link
            href={`/passenger/bookings/${ticket.bookingId}/receipt`}
            className="text-sm font-semibold text-[#002451] hover:underline"
          >
            Payment Receipt
          </Link>

          <span className="text-[#c5c7cf]">
            •
          </span>

          <Link
            href="/passenger/dashboard"
            className="text-sm font-semibold text-[#002451] hover:underline"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ========================================
   Ticket Information
======================================== */

function TicketInfo({
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
   Error Helper
======================================== */

function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "We could not load your digital ticket.";
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
  return new Intl.NumberFormat(
    "en-GH",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }
  ).format(amount);
}