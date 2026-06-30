import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  compiler: {
    // Strip console.* from PRODUCTION builds (server routes + client bundles)
    // so debug logs can't leak player IDs / load / injury data into prod logs.
    // console.error is kept so genuine failures still surface in ops logging.
    // Development is unaffected — all console output still works locally.
    removeConsole: { exclude: ["error"] },
  },
  experimental: {
    // Disable Turbopack persistence to avoid SST filesystem writes
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
