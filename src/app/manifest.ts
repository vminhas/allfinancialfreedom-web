import type { MetadataRoute } from 'next'

// PWA manifest for the AFF agent portal. Enables 'Add to Home
// Screen' / install-as-app on supported browsers (Chrome/Edge fire
// the beforeinstallprompt event when this is present; iOS Safari
// uses it for the standalone app metadata).
//
// start_url + scope are pinned to /agents so the installed app
// lands directly in the portal, skipping the marketing site.
// display: 'standalone' hides browser chrome — the running app
// looks like a native app.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AFF Agent Portal',
    short_name: 'AFF Agent',
    description: 'All Financial Freedom agent portal — your phase roadmap, business pipeline, and team.',
    start_url: '/agents',
    scope: '/agents',
    display: 'standalone',
    background_color: '#0A1628',
    theme_color: '#0A1628',
    orientation: 'portrait',
    icons: [
      {
        src: '/agents/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: '64x64',
        type: 'image/svg+xml',
      },
    ],
  }
}
