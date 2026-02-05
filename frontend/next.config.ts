import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages that need native bindings
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
