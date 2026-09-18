"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { FirebaseError } from "firebase/app";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Operator Login Page
// ========================================

export default function OperatorLoginPage() {
  const router = useRouter();

  // ========================================
  // Form State
  // ========================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  // ========================================
  // Operator Login
  // ========================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setMessage("");
    setIsSubmitting(true);

    try {
      // ========================================
      // Firebase Authentication
      // ========================================

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      const uid = credential.user.uid;

      // ========================================
      // Verify Operator User Profile
      // ========================================

      const userSnapshot = await getDoc(
        doc(db, "users", uid)
      );

      if (!userSnapshot.exists()) {
        await signOut(auth);

        setMessage(
          "Your operator profile could not be found."
        );

        return;
      }

      const userData = userSnapshot.data();

      if (userData.role !== "operator") {
        await signOut(auth);

        setMessage(
          "This account is not authorized for the operator portal."
        );

        return;
      }

      // ========================================
      // Verify Operator Membership
      // ========================================

      const memberSnapshot = await getDoc(
        doc(db, "operatorMembers", uid)
      );

      if (!memberSnapshot.exists()) {
        await signOut(auth);

        setMessage(
          "Your transport company membership could not be found."
        );

        return;
      }

      const memberData = memberSnapshot.data();

      if (memberData.status !== "active") {
        await signOut(auth);

        setMessage(
          "Your operator account is currently inactive."
        );

        return;
      }

      if (!memberData.companyId) {
        await signOut(auth);

        setMessage(
          "No transport company is assigned to this account."
        );

        return;
      }

      // ========================================
      // Operator Authorized
      // ========================================

      router.replace("/operator/dashboard");
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (
          error.code === "auth/invalid-credential" ||
          error.code === "auth/wrong-password" ||
          error.code === "auth/user-not-found"
        ) {
          setMessage(
            "Incorrect email or password."
          );
        } else if (
          error.code === "auth/too-many-requests"
        ) {
          setMessage(
            "Too many sign-in attempts. Please try again later."
          );
        } else {
          setMessage(
            "Unable to sign in. Please try again."
          );
        }
      } else {
        setMessage(
          "Unable to sign in. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // ========================================
  // Page UI
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ========================================
            Branding Panel
        ======================================== */}

        <section className="relative hidden overflow-hidden bg-[#002451] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link href="/">
              <Image
                src="/zano.webp"
                alt="Zano"
                width={130}
                height={48}
                priority
              />
            </Link>
          </div>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-[#39b5f4]">
              Zano Operator Portal
            </div>

            <h1 className="text-5xl font-black leading-tight">
              Manage your transport
              operations in one place.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-white/70">
              Manage trips, schedules, fares,
              vehicles, boarding points and
              passenger bookings from your Zano
              dashboard.
            </p>
          </div>

          <p className="text-sm text-white/50">
            Zano — Travel Smarter. Move Better.
          </p>
        </section>

        {/* ========================================
            Login Form
        ======================================== */}

        <section className="flex items-center justify-center px-5 py-12 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <Link href="/">
                <Image
                  src="/zano.webp"
                  alt="Zano"
                  width={120}
                  height={44}
                  priority
                />
              </Link>
            </div>

            <div className="mb-8">
              <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-[#ff7417]">
                Operator Portal
              </p>

              <h2 className="text-3xl font-black text-[#002451]">
                Welcome back
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#747680]">
                Sign in with your authorized
                transport company account.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-bold text-[#002451]"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="operator@company.com"
                  className="h-13 w-full rounded-xl border border-[#c8cad4] bg-white px-4 text-sm text-[#10172a] outline-none transition focus:border-[#39b5f4] focus:ring-4 focus:ring-[#39b5f4]/10"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-bold text-[#002451]"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  className="h-13 w-full rounded-xl border border-[#c8cad4] bg-white px-4 text-sm text-[#10172a] outline-none transition focus:border-[#39b5f4] focus:ring-4 focus:ring-[#39b5f4]/10"
                />
              </div>

              {message ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-13 w-full items-center justify-center rounded-xl bg-[#ff7417] px-5 text-sm font-black text-white transition hover:bg-[#e96308] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? "Signing in..."
                  : "Sign in to Operator Portal"}
              </button>
            </form>

            <div className="mt-8 border-t border-[#c8cad4]/70 pt-6 text-center">
              <Link
                href="/"
                className="text-sm font-bold text-[#002451] hover:text-[#ff7417]"
              >
                ← Return to Zano
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}