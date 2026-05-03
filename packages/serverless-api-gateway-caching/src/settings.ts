/**
 * @interlace/serverless-api-gateway-caching — Settings parser
 *
 * Reads `custom.interlaceCaching` and per-function `caching` event config,
 * merging them into fully-resolved settings.
 */

import type { ServerlessInstance } from './framework.js';
import type {
  CachingPluginConfig,
  EndpointCachingConfig,
  EndpointSettings,
  ResolvedCachingSettings,
  PerKeyInvalidationConfig,
  AdditionalEndpointConfig,
} from './types.js';

// Defaults intentionally match the community `serverless-api-gateway-caching`
// plugin so that swapping the import is a no-op for existing deployments.
const DEFAULT_TTL = 3600;
const DEFAULT_CLUSTER_SIZE = '0.5' as const;
const DEFAULT_PER_KEY_INVALIDATION: PerKeyInvalidationConfig = {
  requireAuthorization: true,
  handleUnauthorizedRequests: 'IgnoreWithWarning',
};

/**
 * Parse a string-form HTTP event (e.g. `'GET /users/{id}'`) into `{ method, path }`.
 * Returns `undefined` if the string is malformed.
 *
 * The Serverless Framework supports two shapes for `http` events:
 *   - Object form: `{ http: { method: 'get', path: '/users/{id}' } }`
 *   - String form: `{ http: 'get /users/{id}' }`
 *
 * Plugins must accept both — we mirror the community plugin's behavior.
 */
function parseStringHttpEvent(
  value: string,
): { method: string; path: string } | undefined {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2) return undefined;
  return { method: parts[0], path: parts[1] };
}

/**
 * Parse and resolve all caching settings from a Serverless service config.
 */
export function resolveSettings(
  serverless: ServerlessInstance,
): ResolvedCachingSettings {
  const custom = serverless.service.custom ?? {};
  const pluginConfig = (custom.interlaceCaching ?? {}) as CachingPluginConfig;

  const globalEnabled = pluginConfig.enabled ?? false;
  const globalTtl = pluginConfig.ttlInSeconds ?? DEFAULT_TTL;
  const globalEncrypted = pluginConfig.dataEncrypted ?? false;
  const globalPerKey =
    pluginConfig.perKeyInvalidation ?? DEFAULT_PER_KEY_INVALIDATION;
  const globalInheritCW =
    pluginConfig.endpointsInheritCloudWatchSettingsFromStage ?? true;
  const basePath = normalizeBasePath(pluginConfig.basePath);

  const endpoints: EndpointSettings[] = [];

  // Iterate over all functions and their HTTP events
  const functionNames = serverless.service.getAllFunctions();
  for (const fnName of functionNames) {
    const fn = serverless.service.getFunction(fnName);
    const events = fn.events ?? [];

    for (const event of events) {
      const rawHttp = event.http ?? event.httpApi;
      if (!rawHttp) continue;

      // Normalize string-form events (`'GET /users/{id}'`) into the object form.
      // String-form events cannot carry per-endpoint `caching` config — that
      // requires the object form. We still emit a settings entry so the
      // global `cachingEnabled` flag reaches the patch operations.
      let method: string;
      let path: string;
      let endpointCaching: EndpointCachingConfig;
      if (typeof rawHttp === 'string') {
        const parsed = parseStringHttpEvent(rawHttp);
        if (!parsed) continue;
        method = parsed.method;
        path = parsed.path;
        endpointCaching = {};
      } else {
        method = rawHttp.method;
        path = rawHttp.path;
        endpointCaching = (rawHttp.caching ?? {}) as EndpointCachingConfig;
      }

      let resourcePath = path.startsWith('/') ? path : `/${path}`;

      // Strip trailing slash (except root)
      if (resourcePath.endsWith('/') && resourcePath.length > 1) {
        resourcePath = resourcePath.slice(0, -1);
      }

      // Prepend basePath for shared gateways
      const fullPath = basePath ? `${basePath}${resourcePath}` : resourcePath;

      endpoints.push({
        resourcePath: fullPath,
        httpMethod: method.toUpperCase(),
        cachingEnabled:
          endpointCaching.enabled !== undefined
            ? globalEnabled
              ? endpointCaching.enabled
              : false
            : false,
        ttlInSeconds: endpointCaching.ttlInSeconds ?? globalTtl,
        dataEncrypted: endpointCaching.dataEncrypted ?? globalEncrypted,
        perKeyInvalidation: endpointCaching.perKeyInvalidation ?? globalPerKey,
        cacheKeyParameters: endpointCaching.cacheKeyParameters ?? [],
        inheritCloudWatchSettingsFromStage:
          endpointCaching.inheritCloudWatchSettingsFromStage ?? globalInheritCW,
        gatewayResourceName: buildGatewayResourceName(resourcePath, method),
        isAdditionalEndpoint: false,
        functionName: fnName,
      });
    }
  }

  // Parse additional endpoints (CF-defined, non-Lambda)
  const additionalEndpoints: EndpointSettings[] = [];
  const additionalConfigs = pluginConfig.additionalEndpoints ?? [];
  for (const additional of additionalConfigs) {
    additionalEndpoints.push(
      resolveAdditionalEndpoint(
        additional,
        globalEnabled,
        globalTtl,
        globalEncrypted,
        globalPerKey,
        globalInheritCW,
      ),
    );
  }

  return {
    cachingEnabled: globalEnabled,
    clusterSize: pluginConfig.clusterSize ?? DEFAULT_CLUSTER_SIZE,
    ttlInSeconds: globalTtl,
    dataEncrypted: globalEncrypted,
    flushOnDeploy: pluginConfig.flushOnDeploy ?? false,
    perKeyInvalidation: globalPerKey,
    sharedApiGateway: pluginConfig.sharedApiGateway ?? false,
    restApiId: pluginConfig.restApiId,
    basePath,
    endpoints,
    additionalEndpoints,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveAdditionalEndpoint(
  config: AdditionalEndpointConfig,
  globalEnabled: boolean,
  globalTtl: number,
  globalEncrypted: boolean,
  globalPerKey: PerKeyInvalidationConfig,
  globalInheritCW: boolean,
): EndpointSettings {
  const caching = config.caching ?? {};
  let path = config.path.startsWith('/') ? config.path : `/${config.path}`;
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1);
  }

  return {
    resourcePath: path,
    httpMethod: config.method.toUpperCase(),
    cachingEnabled:
      caching.enabled !== undefined
        ? globalEnabled
          ? caching.enabled
          : false
        : false,
    ttlInSeconds: caching.ttlInSeconds ?? globalTtl,
    dataEncrypted: caching.dataEncrypted ?? globalEncrypted,
    perKeyInvalidation: caching.perKeyInvalidation ?? globalPerKey,
    cacheKeyParameters: caching.cacheKeyParameters ?? [],
    inheritCloudWatchSettingsFromStage:
      caching.inheritCloudWatchSettingsFromStage ?? globalInheritCW,
    gatewayResourceName: buildGatewayResourceName(path, config.method),
    isAdditionalEndpoint: true,
    functionName: '',
  };
}

/**
 * Build the CloudFormation logical resource name for an API Gateway method.
 *
 * Mirrors the Serverless Framework naming convention:
 * '/users/{id}' + 'GET' → 'ApiGatewayMethodUsersIdVarGet'
 *
 * Rules:
 * - Split path by '/'
 * - Append method
 * - For each segment:
 *   - Remove '+' (greedy path params)
 *   - Remove '_', '.'
 *   - Replace '-' with 'Dash'
 *   - '{param}' → 'ParamVar'
 *   - Capitalize first letter
 */
export function buildGatewayResourceName(path: string, method: string): string {
  const segments = path.split('/').filter(Boolean);
  segments.push(method.toLowerCase());

  const name = segments
    .map((segment) => {
      let s = segment.toLowerCase();
      s = s.replace(/\+/g, '');
      s = s.replace(/_/g, '');
      s = s.replace(/\./g, '');
      s = s.replace(/-/g, 'Dash');

      if (s.startsWith('{')) {
        s = `${s.substring(s.indexOf('{') + 1, s.indexOf('}'))}Var`;
      }

      return s.charAt(0).toUpperCase() + s.slice(1);
    })
    .join('');

  return `ApiGatewayMethod${name}`;
}

function normalizeBasePath(basePath?: string): string | undefined {
  if (!basePath) return undefined;
  let normalized = basePath;
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
