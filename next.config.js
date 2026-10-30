/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Optimize for production
  reactStrictMode: true,

  // Performance optimizations
  compress: true, // Gzip compression
  poweredByHeader: false, // Remove the X-Powered-By header.

  // Set the Turbopack root explicitly to avoid picking up lockfiles in parent directories.
  turbopack: {
    root: __dirname,
  },

  // playwright.config.ts uses 127.0.0.1 as its baseURL, which differs from the dev
  // server's default trusted origin (localhost) and caused static chunk/HMR requests
  // to be blocked. This dev-only setting does not affect standalone production builds.
  allowedDevOrigins: ['127.0.0.1'],

  // Experimental features for improved performance
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react', 'recharts'],
    cpus: 4,
  },

  // Image optimization
  images: {
    // The app has no images that need optimization. Disable Next.js Image Optimizer
    // to exclude the image transformation route and native sharp dependencies from deployment artifacts.
    unoptimized: true,
    formats: ['image/webp'],
    minimumCacheTTL: 3600, // Cache for one hour.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Disable production source maps to speed up builds.
  productionBrowserSourceMaps: false,

  // HTTP header optimization
  // Content-Security-Policy is set per-request in src/proxy.ts (needs a fresh nonce per request).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
