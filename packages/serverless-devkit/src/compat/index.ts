/**
 * @interlace/serverless-devkit — Compat helpers
 *
 * Typed configuration helpers for community plugins.
 * These provide IntelliSense for plugin `custom.*` blocks
 * without requiring the plugin to ship its own types.
 */

// ---------------------------------------------------------------------------
// @interlace/serverless-api-gateway-caching (replaces serverless-api-gateway-caching)
// ---------------------------------------------------------------------------

export interface CachingPerKeyInvalidation {
  requireAuthorization?: boolean;
  handleUnauthorizedRequests?: 'Ignore' | 'IgnoreWithWarning' | 'Fail';
}

export interface CachingConfig {
  /** Enable or disable the cache cluster. Default: false */
  enabled?: boolean;
  /** Cache cluster size in GB. */
  clusterSize?: '0.5' | '1.6' | '6.1' | '13.5' | '28.4' | '58.2' | '118' | '237';
  /** Default TTL in seconds (0-3600). Default: 300 */
  ttlInSeconds?: number;
  /** Encrypt cached data at rest. Default: false */
  dataEncrypted?: boolean;
  /** Flush the cache after every deploy. Default: false */
  flushOnDeploy?: boolean;
  /** Per-key invalidation settings. */
  perKeyInvalidation?: CachingPerKeyInvalidation;
}

/**
 * Generate typed `custom.interlaceCaching` configuration.
 *
 * @example
 * ```ts
 * import { cachingConfig } from '@interlace/serverless-devkit/compat';
 *
 * export default defineConfig({
 *   custom: { ...cachingConfig({ enabled: true, clusterSize: '0.5' }) },
 * });
 * ```
 */
export function cachingConfig(config: CachingConfig): { interlaceCaching: CachingConfig } {
  return { interlaceCaching: config };
}

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
export function domainManagerConfig(
  config: DomainManagerConfig,
): { customDomain: DomainManagerConfig } {
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
