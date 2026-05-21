/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.squarespace-cdn.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Vercel Blob: team photos uploaded from /vault/team-page editor
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
}

module.exports = nextConfig
