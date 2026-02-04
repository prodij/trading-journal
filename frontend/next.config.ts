import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  
  // External packages that need native bindings
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
