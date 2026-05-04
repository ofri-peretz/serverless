import { createMDX } from 'fumadocs-mdx/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  compress: true,

  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['motion', 'motion/react'],
  serverExternalPackages: ['typescript', 'twoslash'],

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'motion',
      'motion/react',
      'fumadocs-ui',
      'fumadocs-core',
    ],
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(monorepoRoot, 'node_modules/react'),
      'react-dom': path.resolve(monorepoRoot, 'node_modules/react-dom'),
      'motion/react': 'motion',
      'fumadocs-ui': path.resolve(monorepoRoot, 'node_modules/fumadocs-ui'),
      'fumadocs-core': path.resolve(monorepoRoot, 'node_modules/fumadocs-core'),
      tailwindcss: path.resolve(monorepoRoot, 'node_modules/tailwindcss'),
    };
    return config;
  },

  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
    {
      source: '/_next/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],

  redirects: async () => [
    {
      source: '/docs',
      destination: '/docs/getting-started',
      permanent: true,
    },
    // 2026-05: caching plugin folder renamed to align with the npm short-name
    // (`api-gateway-caching`). Preserve external links into old paths.
    {
      source: '/docs/plugins/caching',
      destination: '/docs/plugins/api-gateway-caching',
      permanent: true,
    },
    {
      source: '/docs/plugins/caching/cache-keys',
      destination: '/docs/plugins/api-gateway-caching/recipes/cache-keys',
      permanent: true,
    },
    {
      source: '/docs/plugins/caching/shared-gateway',
      destination: '/docs/plugins/api-gateway-caching/recipes/shared-gateway',
      permanent: true,
    },
    {
      source: '/docs/plugins/caching/removal',
      destination: '/docs/plugins/api-gateway-caching/recipes/removal',
      permanent: true,
    },
    {
      source: '/docs/plugins/caching/:slug*',
      destination: '/docs/plugins/api-gateway-caching/:slug*',
      permanent: true,
    },
  ],
};

export default withMDX(config);
