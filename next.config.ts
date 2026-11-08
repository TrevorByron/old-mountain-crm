import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Room for photos uploaded in the broadcast editor. The browser shrinks them first.
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
