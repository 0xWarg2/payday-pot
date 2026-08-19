import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bắt buộc cho relayer-sdk WASM threads (cross-origin isolation)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
