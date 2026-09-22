import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Снимки уходят в серверное действие в base64: десять уменьшенных
    // скриншотов не помещаются в стандартный лимит в один мегабайт.
    serverActions: { bodySizeLimit: '12mb' },
  },
  /* config options here */
};

export default nextConfig;
