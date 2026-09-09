import Image from "next/image";
import Link from "next/link";

// ========================================
// Privacy Policy Page
// ========================================

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          Zano collects information required to provide and manage your
          account, bookings, tickets, payments, and travel services.
        </p>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          This may include your name, email address, phone number, account
          information, booking history, and other information necessary to
          operate the platform.
        </p>

        <p className="mt-4 leading-7 text-[var(--zano-muted)]">
          Your information should only be used for legitimate platform
          operations and handled in accordance with applicable privacy and
          data-protection requirements.
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