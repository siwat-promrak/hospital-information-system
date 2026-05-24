import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Same-origin proxy from the browser to the NestJS API. The session
   * cookie (`next-auth.session-token`) travels with the request because
   * the browser sees the call as same-origin. `BACKEND_INTERNAL_URL` is
   * server-only — the browser never learns the BE host directly.
   */
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001";

    return [
      {
        source: "/api/be/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
