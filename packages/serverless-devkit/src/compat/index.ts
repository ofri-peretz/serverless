/**
 * @interlace/serverless-devkit — Compat helpers
 *
 * Typed configuration helpers for **community plugins** that don't ship
 * TypeScript types of their own. Each helper returns a typed
 * `{ <customKey>: T }` object you can spread into `defineConfig({ custom })`.
 *
 * **Why this file exists for some plugins but not others:**
 *
 * - For `@interlace/*` plugins (caching, etc.) we ship types directly via
 *   {@link PluginConfigRegistry} module augmentation. Importing the plugin
 *   automatically extends `defineConfig({ custom: { ... } })` with full
 *   IntelliSense — no compat helper needed. See
 *   `docs/serverless-devkit/extending-types.mdx` for the convention.
 * - For community plugins that don't have types, the compat helpers below
 *   provide a curated, named-parameter surface. The downside: types here
 *   can drift from the plugin's real API (no upstream coupling), so we
 *   only maintain compat helpers for plugins we actively use.
 */

// ---------------------------------------------------------------------------
// serverless-domain-manager
// ---------------------------------------------------------------------------

export interface DomainManagerConfig {
  domainName: string;
  basePath?: string;
  stage?: string;
  certificateName?: string;
  certificateArn?: string;
  createRoute53Record?: boolean;
  createRoute53IPv6Record?: boolean;
  endpointType?: 'REGIONAL' | 'EDGE';
  securityPolicy?: 'TLS_1_0' | 'TLS_1_2';
  apiType?: 'rest' | 'http' | 'websocket';
  hostedZoneId?: string;
  hostedZonePrivate?: boolean;
  enabled?: boolean;
  autoDomain?: boolean;
  autoDomainWaitFor?: string;
  allowPathMatching?: boolean;
  route53Profile?: string;
  route53Region?: string;
  preserveExternalPathMappings?: boolean;
  tlsTruststoreUri?: string;
  tlsTruststoreVersion?: string;
}

/**
 * Generate typed `custom.customDomain` configuration for serverless-domain-manager.
 */
export function domainManagerConfig(config: DomainManagerConfig): {
  customDomain: DomainManagerConfig;
} {
  return { customDomain: config };
}

// ---------------------------------------------------------------------------
// serverless-prune-plugin
// ---------------------------------------------------------------------------

export interface PruneConfig {
  /** Automatically prune after deploy. Default: false */
  automatic?: boolean;
  /** Number of previous versions to keep. */
  number?: number;
  /** Include Lambda layers in pruning. Default: false */
  includeLayers?: boolean;
}

/**
 * Generate typed `custom.prune` configuration for serverless-prune-plugin.
 */
export function pruneConfig(config: PruneConfig): { prune: PruneConfig } {
  return { prune: config };
}
