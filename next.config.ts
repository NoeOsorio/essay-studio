import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root so Turbopack doesn't pick up a stray
  // ~/package-lock.json or any parent lockfile.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
