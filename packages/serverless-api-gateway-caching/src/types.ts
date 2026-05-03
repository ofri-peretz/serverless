/**
 * @interlace/serverless-api-gateway-caching — Types
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
  /**
   * Override the mapped value for integration request parameters.
   * Use for body-based cache keys:
   *   { name: 'integration.request.header.bodyValue', mappedFrom: 'method.request.body' }
   */
  mappedFrom?: string;
  /** @deprecated Use `mappedFrom` instead. Alias for backward compat. */
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
  /** Inherit CloudWatch settings (log level, data trace, metrics) from stage. Default: true */
  inheritCloudWatchSettingsFromStage?: boolean;
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

/** Additional endpoint — for CF-defined resources that aren't Lambda functions */
export interface AdditionalEndpointConfig {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Resource path (e.g., '/serverless') */
  path: string;
  /** Caching configuration for this endpoint */
  caching?: EndpointCachingConfig;
}

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
  /** Shared API Gateway — skip stage-level cache cluster changes. Default: false */
  sharedApiGateway?: boolean;
  /** Explicit REST API ID (for shared/cross-stack gateways) */
  restApiId?: string;
  /** Base path for shared API Gateway */
  basePath?: string;
  /** Inherit CloudWatch settings from stage to per-method settings. Default: true */
  endpointsInheritCloudWatchSettingsFromStage?: boolean;
  /** Additional endpoints defined in CF (non-Lambda). */
  additionalEndpoints?: AdditionalEndpointConfig[];
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
  /** Inherit CloudWatch settings from stage */
  inheritCloudWatchSettingsFromStage: boolean;
  /** CF resource name (e.g., 'ApiGatewayMethodUsersIdVarGet') */
  gatewayResourceName: string;
  /** Whether this is an additional (CF-defined) endpoint */
  isAdditionalEndpoint: boolean;
  /** Function name (empty for additional endpoints) */
  functionName: string;
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
  /** Whether the API Gateway is shared (skip stage-level changes) */
  sharedApiGateway: boolean;
  /** Rest API ID (auto-detected or configured) */
  restApiId?: string;
  /** Base path */
  basePath?: string;
  /** Per-endpoint settings (from function events) */
  endpoints: EndpointSettings[];
  /** Additional endpoint settings (from CF resources) */
  additionalEndpoints: EndpointSettings[];
}

/** AWS API Gateway UpdateStage patch operation */
export interface PatchOperation {
  op: 'replace';
  path: string;
  value: string;
}

/** CloudWatch method settings from the stage (for inheritance) */
export interface StageMethodSettings {
  loggingLevel?: string;
  dataTraceEnabled?: boolean;
  metricsEnabled?: boolean;
}
