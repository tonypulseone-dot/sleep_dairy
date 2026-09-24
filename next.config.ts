import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Самодостаточная сборка: в образ едет только то, что нужно для запуска.
  output: 'standalone',
};

export default nextConfig;
