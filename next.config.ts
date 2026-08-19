import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Budget .xlsx uploads (charts/formatting inflate size) exceed the 1 MB
    // default for Server Actions. Stay under Vercel's ~4.5 MB request limit.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
