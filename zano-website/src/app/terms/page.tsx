import Image from "next/image";
import Link from "next/link";

// ========================================
// Terms Of Service Page
// ========================================

export default function TermsPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm sm:p-10">

        {/* ========================================
            Logo
        ======================================== */}

        <div className="flex justify-center">
          <Image
            src="/zano.webp"
            alt="Zano - Ride. Connect. Go."
            width={180}
            height={180}
            className="h-auto w-36 object-contain"
          />
        </div>

        {/* ========================================
            Content
        ======================================== */}

        <h1 className="mt-6 text-3xl font-bold text-[var(--zano-navy)]">
          Terms of Service
        </h1>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          These Terms of Service govern your use of the Zano platform,
          including account creation, trip discovery, bookings, payments,
          tickets, and other transportation-related services.
        </p>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          By creating an account or using Zano, you agree to provide accurate
          information, use the platform lawfully, and comply with applicable
          booking and travel requirements.
        </p>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          Additional terms relating to payments, cancellations, refunds,
          operators, and passenger responsibilities will be added as the
          platform policies are finalized.
        </p>

        <Link
          href="/signup"
          className="mt-8 inline-block font-semibold text-[var(--zano-orange)]"
        >
          ← Back to create account
        </Link>
      </div>
    </main>
  );
}