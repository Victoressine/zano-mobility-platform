import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* ========================================
     Turbopack
  ======================================== */

  turbopack: {
    root: path.resolve(__dirname),
  },

  /* ========================================
     Server Dependencies
  ======================================== */

  serverExternalPackages: [
    "firebase-admin",
    "jwks-rsa",
    "jose",
  ],

  /* ========================================
     Remote Images
  ======================================== */

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;