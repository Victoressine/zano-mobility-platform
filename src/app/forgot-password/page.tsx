"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";

import { auth } from "@/lib/firebase/client";

// ========================================
// Forgot Password Page
// ========================================

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================================
  // Password Reset Handler
  // ========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      setIsSubmitting(true);

      await sendPasswordResetEmail(auth, email.trim());

      setMessage("Password reset email sent successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to send password reset email."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ========================================
  // Page UI
  // ========================================

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm sm:p-10">

        {/* ========================================
            Zano Logo
        ======================================== */}

        <div className="flex justify-center">
          <Image
            src="/zano.webp"
            alt="Zano - Ride. Connect. Go."
            width={220}
            height={220}
            priority
            className="h-auto w-40 object-contain sm:w-44"
          />
        </div>

        {/* ========================================
            Heading
        ======================================== */}

        <div className="mt-2 text-center">
          <h1 className="text-3xl font-bold text-[var(--zano-navy)]">
            Forgot password?
          </h1>

          <p className="mt-2 text-sm text-[var(--zano-muted)]">
            Enter your email address and we&apos;ll send you a password reset
            link.
          </p>
        </div>

        {/* ========================================
            Reset Form
        ======================================== */}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--zano-border)] px-4 py-3 outline-none transition focus:border-[var(--zano-blue)]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[var(--zano-orange)] px-4 py-3.5 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {/* ========================================
            Status Message
        ======================================== */}

        {message && (
          <p className="mt-5 text-center text-sm text-[var(--zano-muted)]">
            {message}
          </p>
        )}

        {/* ========================================
            Back To Login
        ======================================== */}

        <p className="mt-7 text-center text-sm text-[var(--zano-muted)]">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--zano-orange)]"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}