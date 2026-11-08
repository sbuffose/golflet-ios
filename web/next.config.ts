import type { NextConfig } from "next";

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // t185u: Geist TTF + metrics for the server-side A4 PDF (lib/pdf-mini.ts reads them from process.cwd())
  outputFileTracingIncludes: { "/api/plans/[id]/pdf": ["./lib/pdf-fonts/**"], "/api/plans/[id]/yardbook": ["./lib/pdf-fonts/**", "./lib/print-logos/**"], "/api/course-maps/[club]/[course]/libreta": ["./lib/pdf-fonts/**", "./lib/print-logos/**"] },
  async redirects() {
    // Password recovery: open the club-system setup page without ever showing its hostname on Golflet UI.
    return [{ source: "/recuperar", destination: "https://app.golfistics.com/golf/golfisticsapp_login.php", permanent: false }];
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }, { source: "/login", destination: "/login.html" }] };
  },
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
