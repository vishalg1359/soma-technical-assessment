/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Pexels serves every rendition from this host; scoped narrowly so a bad
    // imageUrl in the database cannot turn the optimizer into an open proxy.
    remotePatterns: [{ protocol: 'https', hostname: 'images.pexels.com' }],
  },
};

export default nextConfig;
