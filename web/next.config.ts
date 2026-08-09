import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile the shared plain-TS tokens package.
  transpilePackages: ["@nmao/design-tokens"],
};

export default nextConfig;
