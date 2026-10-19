import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() / unauthorized() from next/navigation, which every admin
    // section's gate (`requireAdminSection`) and /admin itself throw to render the
    // 403 and 401 pages. Without it those calls throw and every section breaks.
    authInterrupts: true,
  },
  allowedDevOrigins: [
    "192.168.100.12",
    "192.168.100.12:3000",
    "192.168.*",
    "localhost",
    "127.0.0.1",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
