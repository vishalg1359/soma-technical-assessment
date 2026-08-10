/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev and production builds get their own output directory. Sharing one means
  // `npm run build` overwrites the chunks a running `npm run dev` is still
  // serving, and the dev server dies with "Cannot find module './948.js'" --
  // a confusing failure that looks like broken code and isn't.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',

  poweredByHeader: false,

  images: {
    // Pexels serves every rendition from this host; scoped narrowly so a bad
    // imageUrl in the database cannot turn the optimizer into an open proxy.
    remotePatterns: [{ protocol: 'https', hostname: 'images.pexels.com' }],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // The app is never a frame, so framing it is only ever clickjacking.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            // Everything the page needs is same-origin, except Pexels photos.
            // `unsafe-inline`/`unsafe-eval` on scripts is what Next's own
            // bootstrap and dev overlay require; the rest is closed down.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob: https://images.pexels.com",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'" +
                (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
              "font-src 'self'",
              "connect-src 'self'" + (process.env.NODE_ENV === 'development' ? ' ws: wss:' : ''),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
      {
        // The task list is per-request state, never a cacheable document.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
