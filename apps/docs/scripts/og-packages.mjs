/**
 * Canonical card copy for the Serverless Interlace OG banners.
 *
 * `slug` MUST equal the published package name with the `@interlace/serverless-`
 * scope prefix stripped — that is what every package README's banner links to
 * (https://serverless.interlace.tools/images/og-${slug}.png).
 *
 * `hero` is the unscoped package name: the scoped form (43 chars) cannot fit the
 * frozen 1072px hero rail at the 56px floor, and truncating it would read as a
 * broken card rather than a deliberate one.
 *
 * `description` is a hand-written one-liner, NOT package.json's description —
 * the rail fits ~59 mono chars at 30px and the manifest copy is 3x that.
 *
 * `pillar` drives the single accent on the card (orange = security, green =
 * everything else), matching the ESLint ecosystem's accent discipline.
 */
export const PACKAGES = [
  {
    slug: 'iam-roles-per-function',
    package: '@interlace/serverless-iam-roles-per-function',
    hero: 'serverless-iam-roles-per-function',
    description: 'Per-function IAM roles',
    pillar: 'security',
  },
  {
    slug: 'api-gateway-caching',
    package: '@interlace/serverless-api-gateway-caching',
    hero: 'serverless-api-gateway-caching',
    description: 'API Gateway cache clusters',
    pillar: 'performance',
  },
  {
    slug: 'devkit',
    package: '@interlace/serverless-devkit',
    hero: 'serverless-devkit',
    description: 'TypeScript-first config toolkit',
    pillar: 'tooling',
  },
];
