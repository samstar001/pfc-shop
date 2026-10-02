import type { NextConfig } from "next";

// Where the Express API lives (read at build time on Vercel); trailing slashes are removed
const backend = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  // Proxy /api/* to the backend so the browser only talks to one domain (no CORS, cookies just work)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },

  // Allow product images hosted on Cloudinary
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
};

export default nextConfig;
