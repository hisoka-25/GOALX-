import type {
  NextConfig
} from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy
  },
  {
    key: "Strict-Transport-Security",
    value:
      "max-age=63072000; includeSubDomains; preload"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Referrer-Policy",
    value:
      "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin"
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin"
  }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  experimental: {
    serverActions: {
      bodySizeLimit: "12mb"
    }
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      }
    ]
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
