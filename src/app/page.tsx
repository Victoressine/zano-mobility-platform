import Image from "next/image";
import Link from "next/link";

// ========================================
// Home Page Data
// ========================================

const popularRoutes = [
  {
    from: "Accra",
    to: "Kumasi",
    duration: "4h 30m",
    startingFare: "GH₵120",
  },
  {
    from: "Accra",
    to: "Cape Coast",
    duration: "2h 30m",
    startingFare: "GH₵85",
  },
  {
    from: "Accra",
    to: "Takoradi",
    duration: "4h",
    startingFare: "GH₵110",
  },
  {
    from: "Accra",
    to: "Ho",
    duration: "3h 30m",
    startingFare: "GH₵95",
  },
];

const features = [
  {
    number: "01",
    title: "Find your route",
    description:
      "Search intercity routes, schedules and trusted transport operators.",
  },
  {
    number: "02",
    title: "Compare your options",
    description:
      "Compare departure times, fares, buses and available seats.",
  },
  {
    number: "03",
    title: "Choose your seat",
    description:
      "Select your preferred bus and seat before your journey.",
  },
  {
    number: "04",
    title: "Stay informed",
    description:
      "Access your ticket and journey information from one place.",
  },
];

// ========================================
// Small Reusable Icons
// ========================================

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M12 21s7-5.15 7-12A7 7 0 1 0 5 9c0 6.85 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="9"
        r="2.4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 3v4M16 3v4M3 10h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.5 19c.5-3.5 2.5-5 5.5-5s5 1.5 5.5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 6.5a2.5 2.5 0 0 1 0 5M17 14c2.2.5 3.2 1.9 3.5 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M5 12h14M14 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ========================================
// Home Page
// ========================================

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f7ff] text-[#10172a]">
      {/* ========================================
          Header
      ======================================== */}

      <header className="absolute left-0 top-0 z-30 w-full">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10 lg:px-16">
          <Link
            href="/"
            className="flex items-center rounded-xl bg-white px-4 py-2 shadow-sm"
          >
            <Image
              src="/zano.webp"
              alt="Zano"
              width={125}
              height={45}
              priority
              className="h-auto w-[105px] md:w-[120px]"
            />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-white lg:flex">
            <Link
              href="/"
              className="transition hover:text-[#ff7417]"
            >
              Home
            </Link>

            <Link
              href="/search"
              className="transition hover:text-[#ff7417]"
            >
              Find a Bus
            </Link>

            <Link
              href="/passenger/dashboard"
              className="transition hover:text-[#ff7417]"
            >
              My Trips
            </Link>

            <a
              href="#how-it-works"
              className="transition hover:text-[#ff7417]"
            >
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href="/login"
              className="hidden rounded-xl border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:block"
            >
              Log in
            </Link>

            <Link
              href="/signup"
              className="rounded-xl bg-[#ff7417] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#e96510]"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================
          Hero
      ======================================== */}

      <section className="relative overflow-hidden bg-[#002451]">
        {/* Background decoration */}

        <div className="absolute inset-0">
          <div className="absolute -right-32 top-20 h-[480px] w-[480px] rounded-full bg-[#39b5f4]/10 blur-3xl" />

          <div className="absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#ff7417]/10 blur-3xl" />

          <div className="absolute inset-0 bg-[linear-gradient(110deg,#002451_0%,#002451_52%,#07396d_100%)] opacity-95" />
        </div>

        <div className="relative mx-auto max-w-[1440px] px-5 pb-40 pt-40 md:px-10 md:pb-44 md:pt-48 lg:px-16">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#ff7417]" />
              Ghana&apos;s smarter intercity mobility experience
            </div>

            <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl">
              Travel Smarter.
              <br />
              <span className="text-[#ff7417]">
                Move Better.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/75 md:text-xl">
              Find reliable intercity mobility in one place.
              Compare routes, operators, schedules, fares and
              seats before you travel.
            </p>

            <div className="mt-8 flex flex-wrap gap-6 text-sm text-white/80">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#ff7417]">
                  ✓
                </span>
                Verified operators
              </span>

              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#ff7417]">
                  ✓
                </span>
                Clear fares
              </span>

              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#ff7417]">
                  ✓
                </span>
                Seat selection
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================
          Search Card
      ======================================== */}

      <section className="relative z-20 -mt-24 px-5 md:px-10 lg:px-16">
        <div className="mx-auto max-w-[1310px]">
          <form
            action="/search"
            method="GET"
            className="rounded-[28px] bg-white p-5 shadow-[0_25px_70px_rgba(0,36,81,0.16)] md:p-7 lg:p-8"
          >
            <div className="mb-6 flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff7417]">
                  Find your journey
                </p>

                <h2 className="mt-1 text-2xl font-bold text-[#002451] md:text-3xl">
                  Where are you going?
                </h2>
              </div>

              <p className="text-sm text-[#747680]">
                Search trusted intercity transport options.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_56px_1fr_1fr_0.8fr_auto] lg:items-end">
              {/* From */}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#747680]">
                  From
                </span>

                <div className="flex h-[62px] items-center gap-3 rounded-2xl border border-[#dfe1e8] px-4 transition focus-within:border-[#39b5f4] focus-within:ring-2 focus-within:ring-[#39b5f4]/10">
                  <span className="text-[#002451]">
                    <LocationIcon />
                  </span>

                  <select
                    name="from"
                    defaultValue="Accra"
                    required
                    className="h-full w-full bg-transparent font-semibold text-[#10172a] outline-none"
                  >
                    <option>Accra</option>
                    <option>Kumasi</option>
                    <option>Cape Coast</option>
                    <option>Takoradi</option>
                    <option>Koforidua</option>
                    <option>Ho</option>
                    <option>Tamale</option>
                  </select>
                </div>
              </label>

              {/* Direction */}

              <div className="hidden h-[62px] items-center justify-center lg:flex">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f6fa] text-[#002451]">
                  →
                </div>
              </div>

              {/* To */}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#747680]">
                  To
                </span>

                <div className="flex h-[62px] items-center gap-3 rounded-2xl border border-[#dfe1e8] px-4 transition focus-within:border-[#39b5f4] focus-within:ring-2 focus-within:ring-[#39b5f4]/10">
                  <span className="text-[#ff7417]">
                    <LocationIcon />
                  </span>

                  <select
                    name="to"
                    defaultValue="Kumasi"
                    required
                    className="h-full w-full bg-transparent font-semibold text-[#10172a] outline-none"
                  >
                    <option>Kumasi</option>
                    <option>Accra</option>
                    <option>Cape Coast</option>
                    <option>Takoradi</option>
                    <option>Koforidua</option>
                    <option>Ho</option>
                    <option>Tamale</option>
                  </select>
                </div>
              </label>

              {/* Date */}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#747680]">
                  Travel date
                </span>

                <div className="flex h-[62px] items-center gap-3 rounded-2xl border border-[#dfe1e8] px-4 transition focus-within:border-[#39b5f4] focus-within:ring-2 focus-within:ring-[#39b5f4]/10">
                  <span className="text-[#002451]">
                    <CalendarIcon />
                  </span>

                  <input
                    type="date"
                    name="date"
                    required
                    className="h-full min-w-0 w-full bg-transparent font-semibold text-[#10172a] outline-none"
                  />
                </div>
              </label>

              {/* Passengers */}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#747680]">
                  Passengers
                </span>

                <div className="flex h-[62px] items-center gap-3 rounded-2xl border border-[#dfe1e8] px-4">
                  <span className="text-[#002451]">
                    <UsersIcon />
                  </span>

                  <select
                    name="passengers"
                    defaultValue="1"
                    className="h-full w-full bg-transparent font-semibold text-[#10172a] outline-none"
                  >
                    {Array.from({ length: 10 }, (_, index) => (
                      <option
                        key={index + 1}
                        value={index + 1}
                      >
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {/* Search */}

              <button
                type="submit"
                className="flex h-[62px] items-center justify-center gap-2 rounded-2xl bg-[#ff7417] px-7 font-bold text-white shadow-[0_12px_30px_rgba(255,116,23,0.28)] transition hover:-translate-y-0.5 hover:bg-[#e96510]"
              >
                Search Buses
                <ArrowIcon />
              </button>
            </div>
          </form>

          {/* Trust strip */}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-[#747680]">
            <span>✓ Verified transport operators</span>
            <span>✓ Reliable journey information</span>
            <span>✓ Secure seat selection</span>
            <span>✓ Digital booking experience</span>
          </div>
        </div>
      </section>

      {/* ========================================
          Popular Routes
      ======================================== */}

      <section className="px-5 py-24 md:px-10 lg:px-16">
        <div className="mx-auto max-w-[1310px]">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff7417]">
                Explore Ghana
              </p>

              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#002451] md:text-4xl">
                Popular intercity routes
              </h2>

              <p className="mt-3 max-w-xl text-[#747680]">
                Discover frequently travelled routes and start
                planning your next journey.
              </p>
            </div>

            <Link
              href="/search"
              className="inline-flex items-center gap-2 font-bold text-[#002451] transition hover:text-[#ff7417]"
            >
              Explore all routes
              <ArrowIcon />
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {popularRoutes.map((route, index) => (
              <Link
                key={`${route.from}-${route.to}`}
                href={`/search?from=${encodeURIComponent(
                  route.from,
                )}&to=${encodeURIComponent(
                  route.to,
                )}&passengers=1`}
                className="group overflow-hidden rounded-[24px] border border-[#e4e5eb] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`relative h-44 overflow-hidden ${
                    index === 0
                      ? "bg-gradient-to-br from-[#002451] to-[#0a4f8c]"
                      : index === 1
                        ? "bg-gradient-to-br from-[#07396d] to-[#39b5f4]"
                        : index === 2
                          ? "bg-gradient-to-br from-[#003561] to-[#187aa9]"
                          : "bg-gradient-to-br from-[#002451] to-[#23547c]"
                  }`}
                >
                  <div className="absolute -right-10 -top-8 h-36 w-36 rounded-full bg-white/10" />
                  <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-[#ff7417]/20" />

                  <div className="absolute inset-x-6 bottom-6 flex items-end justify-between">
                    <div>
                      <p className="text-sm font-medium text-white/65">
                        {route.from}
                      </p>

                      <div className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
                        <span>{route.from}</span>
                        <span className="text-[#ff7417]">→</span>
                        <span>{route.to}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9da7]">
                        Approx. time
                      </p>
                      <p className="mt-1 font-bold text-[#002451]">
                        {route.duration}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9da7]">
                        From
                      </p>
                      <p className="mt-1 font-bold text-[#ff7417]">
                        {route.startingFare}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#eef0f4] pt-5">
                    <span className="font-semibold text-[#002451]">
                      Find trips
                    </span>

                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f6fa] text-[#002451] transition group-hover:bg-[#ff7417] group-hover:text-white">
                      <ArrowIcon />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================
          Why Zano
      ======================================== */}

      <section
        id="how-it-works"
        className="bg-white px-5 py-24 md:px-10 lg:px-16"
      >
        <div className="mx-auto max-w-[1310px]">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff7417]">
                Why Zano?
              </p>

              <h2 className="mt-3 max-w-lg text-4xl font-extrabold tracking-tight text-[#002451] md:text-5xl">
                Intercity mobility should feel simple.
              </h2>

              <p className="mt-6 max-w-lg text-lg leading-8 text-[#747680]">
                Travel information should not be scattered across
                different terminals and operators. Zano brings the
                information you need together so you can make a
                better travel decision before you move.
              </p>

              <Link
                href="/search"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#002451] px-6 py-4 font-bold text-white transition hover:bg-[#07396d]"
              >
                Plan your journey
                <ArrowIcon />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.number}
                  className="rounded-[24px] border border-[#e9eaf0] bg-[#fafaff] p-7"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#002451] text-sm font-bold text-white">
                    {feature.number}
                  </div>

                  <h3 className="mt-7 text-xl font-bold text-[#002451]">
                    {feature.title}
                  </h3>

                  <p className="mt-3 leading-7 text-[#747680]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================
          Operators
      ======================================== */}

      <section className="px-5 py-24 md:px-10 lg:px-16">
        <div className="mx-auto max-w-[1310px]">
          <div className="rounded-[32px] bg-[#002451] px-6 py-12 md:px-12 lg:px-16 lg:py-16">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff7417]">
                  One mobility network
                </p>

                <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">
                  Travel with trusted intercity operators.
                </h2>

                <p className="mt-5 max-w-xl leading-7 text-white/70">
                  Zano is designed to connect passengers with
                  verified operators, real schedules, buses,
                  boarding points and journey information through
                  one mobility platform.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  "VIP Jeoun",
                  "STC",
                  "OA Travel",
                  "VVIP",
                  "Imperial",
                  "More soon",
                ].map((operator) => (
                  <div
                    key={operator}
                    className="flex min-h-24 items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 text-center font-bold text-white backdrop-blur"
                  >
                    {operator}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================
          Journey CTA
      ======================================== */}

      <section className="px-5 pb-24 md:px-10 lg:px-16">
        <div className="mx-auto max-w-[1310px] overflow-hidden rounded-[32px] bg-gradient-to-r from-[#ff7417] to-[#ff8b3d]">
          <div className="relative px-7 py-14 md:px-12 lg:flex lg:items-center lg:justify-between lg:px-16">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[45px] border-white/10" />

            <div className="relative max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/80">
                Ready to move?
              </p>

              <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">
                Your next intercity journey starts here.
              </h2>

              <p className="mt-4 max-w-xl text-white/85">
                Search your route, compare available trips and
                choose the journey that works for you.
              </p>
            </div>

            <Link
              href="/search"
              className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 font-bold text-[#002451] shadow-lg transition hover:-translate-y-0.5 lg:mt-0"
            >
              Find a Bus
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================
          Footer
      ======================================== */}

      <footer className="bg-[#001b3d] px-5 pb-8 pt-14 text-white md:px-10 lg:px-16">
        <div className="mx-auto max-w-[1310px]">
          <div className="grid gap-10 border-b border-white/10 pb-12 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="inline-flex rounded-xl bg-white px-4 py-2">
                <Image
                  src="/zano.webp"
                  alt="Zano"
                  width={120}
                  height={44}
                  className="h-auto w-[110px]"
                />
              </div>

              <p className="mt-5 max-w-md leading-7 text-white/60">
                A unified digital mobility platform connecting
                passengers with reliable intercity transport
                information and services.
              </p>

              <p className="mt-5 font-bold text-[#ff7417]">
                Travel Smarter. Move Better.
              </p>
            </div>

            <div>
              <h3 className="font-bold">Explore</h3>

              <div className="mt-5 flex flex-col gap-3 text-sm text-white/60">
                <Link href="/search">Find a Bus</Link>
                <Link href="/passenger/dashboard">
                  My Trips
                </Link>
                <Link href="/login">Log in</Link>
                <Link href="/signup">Create Account</Link>
              </div>
            </div>

            <div>
              <h3 className="font-bold">Information</h3>

              <div className="mt-5 flex flex-col gap-3 text-sm text-white/60">
                <Link href="/privacy">Privacy Policy</Link>
                <Link href="/terms">Terms & Conditions</Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-8 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © 2026 Zano. All rights reserved.
            </p>

            <p>Ride. Connect. Go.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}