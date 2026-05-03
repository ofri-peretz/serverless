/**
 * @interlace/serverless-plugin-caching — Settings parser
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

      endpoints.push({
        resourcePath: httpEvent.path.startsWith('/') ? httpEvent.path : `/${httpEvent.path}`,
        httpMethod: httpEvent.method.toUpperCase(),
        cachingEnabled: endpointCaching.enabled ?? globalEnabled,
        ttlInSeconds: endpointCaching.ttlInSeconds ?? globalTtl,
        dataEncrypted: endpointCaching.dataEncrypted ?? globalEncrypted,
        perKeyInvalidation: endpointCaching.perKeyInvalidation ?? globalPerKey,
        cacheKeyParameters: endpointCaching.cacheKeyParameters ?? [],
      });
    }
  }

  return {
    cachingEnabled: globalEnabled,
    clusterSize: pluginConfig.clusterSize ?? DEFAULT_CLUSTER_SIZE,
    ttlInSeconds: globalTtl,
    dataEncrypted: globalEncrypted,
    flushOnDeploy: pluginConfig.flushOnDeploy ?? false,
    perKeyInvalidation: globalPerKey,
    restApiId: pluginConfig.restApiId,
    basePath: pluginConfig.basePath,
    endpoints,
  };
}
