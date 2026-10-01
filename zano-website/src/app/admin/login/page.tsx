"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Admin Login Page
// ========================================

export default function AdminLoginPage() {
  const router = useRouter();

  // ========================================
  // Form State
  // ========================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ========================================
  // UI State
  // ========================================

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================================
  // Admin Login
  // ========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setMessage("Please enter your admin email and password.");
      return;
    }

    try {
      setIsSubmitting(true);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      const user = userCredential.user;

      // ========================================
      // Load User Profile
      // ========================================

      const userReference = doc(db, "users", user.uid);
      const userProfile = await getDoc(userReference);

      if (!userProfile.exists()) {
        await signOut(auth);

        setMessage(
          "Your account exists, but an authorized Zano profile could not be found."
        );

        return;
      }

      const profileData = userProfile.data();

      // ========================================
      // Admin Role Protection
      // ========================================

      if (profileData.role !== "admin") {
        await signOut(auth);

        setMessage(
          "This account is not authorized to access Zano Administration."
        );

        return;
      }

      // ========================================
      // Redirect To Admin Dashboard
      // ========================================

      router.replace("/admin/dashboard");
    } catch (error) {
      setMessage(getAdminLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ========================================
  // Page UI
  // ========================================

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f7ff] px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-[#e2e1e8] bg-white p-7 shadow-[0_12px_35px_rgba(0,36,81,0.06)] sm:p-9">
        {/* ========================================
            Zano Logo
        ======================================== */}

        <div className="flex justify-center">
          <Image
            src="/zano.webp"
            alt="Zano"
            width={220}
            height={220}
            priority
            className="h-auto w-40 object-contain sm:w-44"
          />
        </div>

        {/* ========================================
            Heading
        ======================================== */}

        <div className="mt-3 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--zano-orange)]">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--zano-navy)]">
            Admin sign in
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--zano-muted)]">
            Sign in with an authorized Zano administrator account.
          </p>
        </div>

        {/* ========================================
            Login Form
        ======================================== */}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-[#333947]"
            >
              Admin email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              placeholder="admin@zano.com"
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 text-[#141b31] outline-none transition placeholder:text-[#a2a4ad] focus:border-[var(--zano-blue)] focus:ring-2 focus:ring-[var(--zano-blue)]/15 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-[#333947]"
              >
                Password
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-[var(--zano-blue)] transition hover:opacity-80"
              >
                Forgot password?
              </Link>
            </div>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 text-[#141b31] outline-none transition placeholder:text-[#a2a4ad] focus:border-[var(--zano-blue)] focus:ring-2 focus:ring-[var(--zano-blue)]/15 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-2xl bg-[var(--zano-orange)] px-4 py-3.5 font-bold text-white shadow-[0_8px_18px_rgba(255,116,23,0.18)] transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in as Admin"}
          </button>
        </form>

        {/* ========================================
            Status Message
        ======================================== */}

        {message && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-5 rounded-xl bg-[#fff5ef] px-4 py-3 text-center text-sm font-medium text-[#9a3f0b]"
          >
            {message}
          </div>
        )}

        {/* ========================================
            Passenger Login
        ======================================== */}

        <p className="mt-7 text-center text-sm text-[var(--zano-muted)]">
          Passenger account?{" "}
          <Link
            href="/login"
            className="font-bold text-[var(--zano-orange)] transition hover:opacity-80"
          >
            Passenger sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

// ========================================
// Firebase Error Handler
// ========================================

function getAdminLoginErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Unable to sign in. Please try again.";
  }

  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-disabled":
      return "This account has been disabled.";

    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Unable to connect to the authentication service.";

    default:
      console.error("Firebase admin login error:", error);
      return "Unable to sign in. Please try again.";
  }
}