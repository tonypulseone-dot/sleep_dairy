import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Самодостаточная сборка: в образ едет только то, что нужно для запуска.
  output: 'standalone',
  experimental: {
    // Снимки уходят в серверное действие в base64: десять уменьшенных
    // скриншотов не помещаются в стандартный лимит в один мегабайт.
    serverActions: { bodySizeLimit: '12mb' },
  },
  /* config options here */
};

export default nextConfig;
