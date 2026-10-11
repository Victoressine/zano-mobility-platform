
import type { Metadata, Viewport } from "next";
import ZanoAssistant from "@/components/ai/ZanoAssistant";
import "./globals.css";

/* ========================================
   Zano Site Configuration
======================================== */

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ||
    "https://zano-six.vercel.app"
);

const siteName = "Zano";

const siteDescription =
  "Zano is an intelligent intercity mobility platform. " +
  "Discover available trips, compare fares, choose your seat, " +
  "book securely, and manage your journey in one place.";

/* ========================================
   SEO & Application Metadata
======================================== */

export const metadata: Metadata = {
  metadataBase: siteUrl,

  title: {
    default: "Zano | Travel Smarter. Move Better.",
    template: "%s | Zano",
  },

  description: siteDescription,

  applicationName: siteName,

  keywords: [
    "Zano",
    "Zano Ghana",
    "intercity travel Ghana",
    "bus booking Ghana",
    "online bus tickets",
    "AI travel assistant",
    "bus ticket booking",
    "Accra to Kumasi",
    "Ghana transport operators",
    "intercity bus schedules",
    "bus seat booking",
  ],

  authors: [
    {
      name: siteName,
    },
  ],

  creator: siteName,
  publisher: siteName,

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  icons: {
    icon: [
      {
        url: "/zano.webp",
        type: "image/webp",
      },
    ],

    shortcut: "/zano.webp",

    apple: "/zano.webp",
  },

  openGraph: {
    type: "website",
    locale: "en_GH",
    url: siteUrl.toString(),
    siteName,
    title: "Zano | Travel Smarter. Move Better.",
    description: siteDescription,
    images: [
      {
        url: "/zano.webp",
        alt: "Zano logo",
      },
    ],
  },

  twitter: {
    card: "summary",
    title: "Zano | Travel Smarter. Move Better.",
    description: siteDescription,
    images: ["/zano.webp"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

/* ========================================
   Responsive Viewport
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
      <body>
        {children}

        {/* Global Zano AI Travel Assistant */}
        <ZanoAssistant />
      </body>
    </html>
  );
}
