/**
 * @interlace/serverless-api-gateway-caching — Settings parser
 *
 * Reads `custom.interlaceCaching` and per-function `caching` event config,
 * merging them into fully-resolved settings.
 */

import type { ServerlessInstance } from '@interlace/serverless-devkit';
import type {
  CachingPluginConfig,
  EndpointCachingConfig,
  EndpointSettings,
  ResolvedCachingSettings,
  PerKeyInvalidationConfig,
  AdditionalEndpointConfig,
} from './types.js';

const DEFAULT_TTL = 300;
const DEFAULT_CLUSTER_SIZE = '0.5' as const;
const DEFAULT_PER_KEY_INVALIDATION: PerKeyInvalidationConfig = {
  requireAuthorization: true,
  handleUnauthorizedRequests: 'Ignore',
};

/**
 * Parse and resolve all caching settings from a Serverless service config.
 */
export function resolveSettings(serverless: ServerlessInstance): ResolvedCachingSettings {
  const custom = serverless.service.custom ?? {};
  const pluginConfig = (custom.interlaceCaching ?? {}) as CachingPluginConfig;

  const globalEnabled = pluginConfig.enabled ?? false;
  const globalTtl = pluginConfig.ttlInSeconds ?? DEFAULT_TTL;
  const globalEncrypted = pluginConfig.dataEncrypted ?? false;
  const globalPerKey = pluginConfig.perKeyInvalidation ?? DEFAULT_PER_KEY_INVALIDATION;
  const globalInheritCW = pluginConfig.endpointsInheritCloudWatchSettingsFromStage ?? true;
  const basePath = normalizeBasePath(pluginConfig.basePath);

  const endpoints: EndpointSettings[] = [];

  // Iterate over all functions and their HTTP events
  const functionNames = serverless.service.getAllFunctions();
  for (const fnName of functionNames) {
    const fn = serverless.service.getFunction(fnName);
    const events = fn.events ?? [];

    for (const event of events) {
      const httpEvent = event.http ?? event.httpApi;
      if (!httpEvent || typeof httpEvent === 'string') continue;

      const endpointCaching = (httpEvent.caching ?? {}) as EndpointCachingConfig;
      let resourcePath = httpEvent.path.startsWith('/') ? httpEvent.path : `/${httpEvent.path}`;

      // Strip trailing slash (except root)
      if (resourcePath.endsWith('/') && resourcePath.length > 1) {
        resourcePath = resourcePath.slice(0, -1);
      }

      // Prepend basePath for shared gateways
      const fullPath = basePath ? `${basePath}${resourcePath}` : resourcePath;

      endpoints.push({
        resourcePath: fullPath,
        httpMethod: httpEvent.method.toUpperCase(),
        cachingEnabled: endpointCaching.enabled !== undefined
          ? (globalEnabled ? endpointCaching.enabled : false)
          : false,
        ttlInSeconds: endpointCaching.ttlInSeconds ?? globalTtl,
        dataEncrypted: endpointCaching.dataEncrypted ?? globalEncrypted,
        perKeyInvalidation: endpointCaching.perKeyInvalidation ?? globalPerKey,
        cacheKeyParameters: endpointCaching.cacheKeyParameters ?? [],
        inheritCloudWatchSettingsFromStage:
          endpointCaching.inheritCloudWatchSettingsFromStage ?? globalInheritCW,
        gatewayResourceName: buildGatewayResourceName(resourcePath, httpEvent.method),
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
      resolveAdditionalEndpoint(additional, globalEnabled, globalTtl, globalEncrypted, globalPerKey, globalInheritCW),
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
    cachingEnabled: caching.enabled !== undefined
      ? (globalEnabled ? caching.enabled : false)
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
        s = s.substring(s.indexOf('{') + 1, s.indexOf('}')) + 'Var';
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
