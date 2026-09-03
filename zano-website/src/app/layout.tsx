import type { Metadata, Viewport } from "next";
import "./globals.css";

/* ========================================
   Zano Metadata
======================================== */

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),

  title: {
    default: "Zano | Ride. Connect. Go.",
    template: "%s | Zano",
  },

  description:
    "Search intercity routes, compare trips, choose your seat, book securely, and manage your journeys with Zano.",

  applicationName: "Zano",

  keywords: [
    "Zano",
    "bus booking",
    "Ghana bus booking",
    "intercity travel",
    "bus tickets Ghana",
    "Accra",
    "Kumasi",
    "Cape Coast",
    "Takoradi",
    "Tamale",
  ],

  authors: [
    {
      name: "Zano",
    },
  ],

  creator: "Zano",
  publisher: "Zano",

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  icons: {
    icon: "/favicon.ico",
  },
};

/* ========================================
   Zano Viewport
======================================== */

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#002451",
};

/* ========================================
   Root Layout
======================================== */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}