// next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  //  Ensure server-only execution (important for OpenAI keys)
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },

  // ⚡ Optimize API performance
  poweredByHeader: false,

  // Optional: logging (useful during development)
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
