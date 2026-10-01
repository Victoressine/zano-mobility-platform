import Image from "next/image";
import Link from "next/link";

// ========================================
// Zano Admin Portal
// ========================================

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#c8cad4]/50 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="text-3xl font-black tracking-tight text-[#002451]"
          >
            Zano
          </Link>

          <Link
            href="/"
            className="text-sm font-bold text-[#747680] transition hover:text-[#002451]"
          >
            Back to website
          </Link>
        </div>
      </header>

      {/* ========================================
          Admin Welcome
      ======================================== */}

      <section className="flex min-h-[calc(100vh-81px)] items-center px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-[32px] bg-white shadow-sm ring-1 ring-[#c8cad4]/40">
            <div className="grid lg:grid-cols-2">
              {/* ========================================
                  Content
              ======================================== */}

              <div className="flex items-center p-8 sm:p-12 lg:p-14">
                <div className="max-w-lg">
                  <div className="inline-flex rounded-full bg-[#39b5f4]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-[#002451]">
                    Zano Admin
                  </div>

                  <h1 className="mt-6 text-4xl font-black leading-tight text-[#002451] sm:text-5xl">
                    Manage Zano
                    from one place.
                  </h1>

                  <p className="mt-5 text-base leading-7 text-[#747680]">
                    View transport companies,
                    bookings and important
                    platform activity through
                    one simple administration
                    dashboard.
                  </p>

                  {/* ========================================
                      Simple Admin Structure
                  ======================================== */}

                  <div className="mt-8 space-y-3">
                    <AdminArea
                      number="01"
                      title="Overview"
                      description="See the important numbers across Zano."
                    />

                    <AdminArea
                      number="02"
                      title="Companies"
                      description="Manage transport companies and their operations."
                    />

                    <AdminArea
                      number="03"
                      title="Bookings"
                      description="View passenger bookings and payments."
                    />
                  </div>

                  {/* ========================================
                      Sign In
                  ======================================== */}

                  <Link
                    href="/admin/login"
                    className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[#ff7417] px-6 py-4 text-sm font-black text-white transition hover:bg-[#e96308] sm:w-auto"
                  >
                    Sign In to Admin
                    <span className="ml-2">
                      →
                    </span>
                  </Link>

                  <p className="mt-4 text-xs leading-5 text-[#747680]">
                    Access is restricted to
                    authorized Zano
                    administrators.
                  </p>
                </div>
              </div>

              {/* ========================================
                  Image
              ======================================== */}

              <div className="relative min-h-[360px] lg:min-h-[650px]">
                <Image
                  src="/images/dashboard/zano bus 2.jpg"
                  alt="Zano intercity bus"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#002451]/45 via-transparent to-transparent" />

                <div className="absolute bottom-7 left-7 right-7 rounded-2xl bg-[#002451]/90 p-5 text-white backdrop-blur-sm">
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-[#39b5f4]">
                    Zano Platform
                  </p>

                  <p className="mt-2 text-lg font-black">
                    Travel Smarter. Move Better.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// ========================================
// Admin Area
// ========================================

function AdminArea({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#c8cad4]/50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#002451] text-xs font-black text-[#39b5f4]">
        {number}
      </div>

      <div>
        <p className="font-black text-[#002451]">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-[#747680]">
          {description}
        </p>
      </div>
    </div>
  );
}