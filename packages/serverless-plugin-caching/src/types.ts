/**
 * @interlace/serverless-plugin-caching — Types
 *
 * All configuration and internal types for the caching plugin.
 */

/** Per-key cache invalidation configuration */
export interface PerKeyInvalidationConfig {
  requireAuthorization?: boolean;
  handleUnauthorizedRequests?: 'Ignore' | 'IgnoreWithWarning' | 'Fail';
}

/** Cache key parameter — reference to a request property */
export interface CacheKeyParameterConfig {
  /** Parameter name (e.g., 'request.path.id', 'request.querystring.page', 'request.header.Accept') */
  name: string;
  /** Override the mapped value for integration request parameters */
  value?: string;
}

/** Per-endpoint caching configuration (on function events) */
export interface EndpointCachingConfig {
  /** Enable caching for this endpoint. Default: inherits from global */
  enabled?: boolean;
  /** TTL in seconds (0-3600). Default: inherits from global */
  ttlInSeconds?: number;
  /** Encrypt cached data at rest. Default: inherits from global */
  dataEncrypted?: boolean;
  /** Per-key invalidation settings */
  perKeyInvalidation?: PerKeyInvalidationConfig;
  /** Cache key parameters — defines what makes a cache key unique */
  cacheKeyParameters?: CacheKeyParameterConfig[];
}

/** Valid API Gateway cache cluster sizes (in GB) */
export type CacheClusterSize =
  | '0.5'
  | '1.6'
  | '6.1'
  | '13.5'
  | '28.4'
  | '58.2'
  | '118'
  | '237';

/** Global caching configuration (under custom.interlaceCaching) */
export interface CachingPluginConfig {
  /** Enable the cache cluster. Default: false */
  enabled?: boolean;
  /** Cache cluster size in GB. Default: '0.5' */
  clusterSize?: CacheClusterSize;
  /** Default TTL in seconds (0-3600). Default: 300 */
  ttlInSeconds?: number;
  /** Encrypt cached data at rest. Default: false */
  dataEncrypted?: boolean;
  /** Flush the entire cache after every deploy. Default: false */
  flushOnDeploy?: boolean;
  /** Per-key invalidation defaults */
  perKeyInvalidation?: PerKeyInvalidationConfig;
  /** Shared API Gateway support */
  restApiId?: string;
  /** Base path for shared API Gateway */
  basePath?: string;
}

/** Resolved settings for a single endpoint */
export interface EndpointSettings {
  /** Full resource path (e.g., '/users/{id}') */
  resourcePath: string;
  /** HTTP method (uppercase) */
  httpMethod: string;
  /** Whether caching is enabled for this endpoint */
  cachingEnabled: boolean;
  /** TTL in seconds */
  ttlInSeconds: number;
  /** Whether data is encrypted at rest */
  dataEncrypted: boolean;
  /** Per-key invalidation config */
  perKeyInvalidation: PerKeyInvalidationConfig;
  /** Cache key parameters */
  cacheKeyParameters: CacheKeyParameterConfig[];
}

/** Fully resolved plugin settings (after merging global + per-endpoint) */
export interface ResolvedCachingSettings {
  /** Global cache enabled flag */
  cachingEnabled: boolean;
  /** Cache cluster size */
  clusterSize: CacheClusterSize;
  /** Default TTL */
  ttlInSeconds: number;
  /** Default data encryption */
  dataEncrypted: boolean;
  /** Flush on deploy */
  flushOnDeploy: boolean;
  /** Default per-key invalidation */
  perKeyInvalidation: PerKeyInvalidationConfig;
  /** Rest API ID (auto-detected or configured) */
  restApiId?: string;
  /** Base path */
  basePath?: string;
  /** Per-endpoint settings */
  endpoints: EndpointSettings[];
}

/** AWS API Gateway UpdateStage patch operation */
export interface PatchOperation {
  op: 'replace';
  path: string;
  value: string;
}
