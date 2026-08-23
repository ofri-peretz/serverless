import { createMDX } from 'fumadocs-mdx/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');

const withMDX = createMDX();

/**
 * Content-Security-Policy in *report-only* mode, with violations reported to
 * PostHog's CSP endpoint (`$csp_violation` events) through the same `/ingest`
 * reverse proxy as the rest of analytics.
 *
 * Report-only by design: this policy is a hypothesis, not a contract. The
 * browser evaluates it, reports what would have been blocked, and blocks
 * nothing — so a wrong rule costs a PostHog event, never a broken page. Once
 * the violation stream is quiet the header can be promoted to the enforcing
 * `Content-Security-Policy` name.
 */
function cspReportOnlyHeaders() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!token) return [];
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // TODO(csp-promotion): do NOT carry 'unsafe-eval' into the enforcing
    // header. It re-enables eval()/new Function() and undermines the XSS
    // mitigation this policy exists for (CWE-749). It is here only so the
    // report-only stream isn't drowned by it; the violation data will say
    // whether anything actually needs it, and Next's nonce support
    // (experimental.cspHeader) is the replacement if something does.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://api.npmjs.org",
    `report-uri /ingest/report/?token=${token}`,
  ].join('; ');
  return [{ key: 'Content-Security-Policy-Report-Only', value: policy }];
}

/**
 * Source maps for PostHog Error Tracking — generated, uploaded, then deleted.
 *
 * `deleteAfterUpload` is the load-bearing option, not a default we inherit:
 * the .map files are produced inside the build, handed to PostHog, and removed
 * from the output before anything is served. Symbolication lives in PostHog,
 * behind auth; the deployment ships the same minified bundle it always did.
 *
 * Inert unless both env vars are set, so local builds and forks stay
 * byte-identical to today and no build can fail for want of a token.
 */
async function withSourcemapUpload(nextConfig) {
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!personalApiKey || !projectId) return nextConfig;
  // Shape-checked, not just present. The gate used to test presence alone,
  // and this repo is where that proved insufficient: POSTHOG_PERSONAL_API_KEY
  // here held a `phc_` project key, so the uploader ran, rejected it, and
  // failed the production deploy with `Invalid Personal API key: "Token looks
  // wrong, must start with 'phx_'"`. A deploy lost to a source-map upload,
  // which is a nicety. Symbolication is worth having; it is not worth a
  // deploy.
  //
  // `phx_` is the personal API key prefix. `phc_` is the *project* key — a
  // different credential, public by design, that cannot authorise an upload.
  // Confusing the two is the likely mistake, so name it in the warning.
  if (!personalApiKey.startsWith('phx_')) {
    console.warn(
      '[sourcemaps] POSTHOG_PERSONAL_API_KEY is set but is not a personal API key (expected a `phx_` prefix; a `phc_` value is the public project key). Skipping source-map upload — errors will report unsymbolicated.',
    );
    return nextConfig;
  }
  // Imported here rather than at module scope: the package is a
  // devDependency, and a top-level import would make this config
  // unloadable in an --omit=dev install even with the gate off.
  const { withPostHogConfig } = await import('@posthog/nextjs-config');
  return withPostHogConfig(nextConfig, {
    personalApiKey,
    projectId,
    sourcemaps: { enabled: true, deleteAfterUpload: true },
  });
}

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
    // One hour, not one year. The optimizer keys on the *source* URL, and
    // sources are stable paths — a year-long floor pinned the optimized
    // derivative long after its source had changed, with no way for a release
    // to evict it. Same defect fixed in the eslint docs (ofri-peretz/eslint#628).
    minimumCacheTTL: 3600,
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
        {
          key: 'Permissions-Policy',
          // `browsing-topics`, not `interest-cohort`: FLoC was withdrawn and
          // no shipping browser reads the old token. The Topics API that
          // replaced it reads this one.
          value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
        },
        // Vercel sends HSTS but omits includeSubDomains.
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
        // Severs the window.opener relationship with cross-origin openers, so
        // this document cannot be reached by another browsing context group.
        // Safe here: nothing in this app calls window.open, so there is no
        // popup flow to break.
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin',
        },
        ...cspReportOnlyHeaders(),
      ],
    },
    {
      source: '/_next/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],

  // PostHog reverse proxy (ANALYTICS_PHILOSOPHY principle 2). Same-origin
  // ingest survives ad-blockers and keeps third-party hosts out of CSP.
  skipTrailingSlashRedirect: true,
  rewrites: async () => [
    {
      source: '/ingest/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    },
    // MUST precede the catch-all below, and MUST keep the trailing slash on
    // the destination. PostHog's CSP endpoint is `/report/` and answers 404
    // for `/report` — while `:path*` drops a trailing slash, so the catch-all
    // rewrote `/ingest/report/` to `https://us.i.posthog.com/report` and every
    // violation report 404'd. Silently: a failing report-uri reports nothing
    // about itself, and an empty event stream reads exactly like a clean
    // policy. Verified: `/report/` → 204, `/report` → 404.
    {
      source: '/ingest/report',
      destination: 'https://us.i.posthog.com/report/',
    },
    {
      source: '/ingest/report/',
      destination: 'https://us.i.posthog.com/report/',
    },
    {
      source: '/ingest/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    },
    {
      source: '/ingest/decide',
      destination: 'https://us.i.posthog.com/decide',
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

export default await withSourcemapUpload(withMDX(config));
