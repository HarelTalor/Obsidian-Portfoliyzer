import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Obsidian Portfoliyzer',
    short_name: 'Portfoliyzer',
    description: 'Automated Buy & Hold Portfolio Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    icons: [
      {
        src: '/mobile_icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/mobile_icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
