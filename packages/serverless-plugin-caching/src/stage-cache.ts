/**
 * @interlace/serverless-plugin-caching — Stage cache operations
 *
 * Handles post-deploy API Gateway stage updates:
 * - Enable/disable cache cluster
 * - Set per-method caching, TTL, encryption, invalidation
 * - Chunked patch operations (AWS limit: 80 per call)
 * - Jittered exponential backoff for ConflictException retries
 */

import type { AwsProvider } from '@interlace/serverless-devkit';
import type { ResolvedCachingSettings, PatchOperation, EndpointSettings } from './types.js';

/** AWS API limit for patch operations per UpdateStage call */
const MAX_PATCH_OPERATIONS = 80;

/** Retry configuration */
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Build all patch operations needed to configure the stage cache.
 */
export function buildPatchOperations(settings: ResolvedCachingSettings): PatchOperation[] {
  const ops: PatchOperation[] = [];

  // Global cache cluster settings
  ops.push({
    op: 'replace',
    path: '/*/*/caching/enabled',
    value: 'false',
  });

  ops.push({
    op: 'replace',
    path: '/cacheClusterEnabled',
    value: String(settings.cachingEnabled),
  });

  if (settings.cachingEnabled) {
    ops.push({
      op: 'replace',
      path: '/cacheClusterSize',
      value: settings.clusterSize,
    });
  }

  // Per-endpoint settings
  for (const endpoint of settings.endpoints) {
    const methodPath = toMethodPath(endpoint);
    ops.push(...buildEndpointOps(methodPath, endpoint));
  }

  return ops;
}

/**
 * Apply patch operations to the API Gateway stage.
 * Chunks operations to respect the 80-op limit and retries on ConflictException.
 */
export async function updateStageCache(
  provider: AwsProvider,
  restApiId: string,
  stageName: string,
  operations: PatchOperation[],
  log: (message: string) => void,
): Promise<void> {
  if (operations.length === 0) {
    log('[interlace-caching] No cache operations to apply.');
    return;
  }

  const chunks = chunkArray(operations, MAX_PATCH_OPERATIONS);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    log(
      `[interlace-caching] Applying cache settings (batch ${i + 1}/${chunks.length}, ${chunk.length} operations)...`,
    );

    await retryWithJitter(async () => {
      await provider.request('APIGateway', 'updateStage', {
        restApiId,
        stageName,
        patchOperations: chunk,
      });
    }, log);
  }
}

/**
 * Flush the API Gateway cache for a stage.
 */
export async function flushStageCache(
  provider: AwsProvider,
  restApiId: string,
  stageName: string,
  log: (message: string) => void,
): Promise<void> {
  log('[interlace-caching] Flushing stage cache...');

  await retryWithJitter(async () => {
    await provider.request('APIGateway', 'flushStageCache', {
      restApiId,
      stageName,
    });
  }, log);

  log('[interlace-caching] Cache flushed successfully.');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildEndpointOps(
  methodPath: string,
  endpoint: EndpointSettings,
): PatchOperation[] {
  const ops: PatchOperation[] = [];

  ops.push({
    op: 'replace',
    path: `${methodPath}/caching/enabled`,
    value: String(endpoint.cachingEnabled),
  });

  ops.push({
    op: 'replace',
    path: `${methodPath}/caching/ttlInSeconds`,
    value: String(endpoint.ttlInSeconds),
  });

  ops.push({
    op: 'replace',
    path: `${methodPath}/caching/dataEncrypted`,
    value: String(endpoint.dataEncrypted),
  });

  ops.push({
    op: 'replace',
    path: `${methodPath}/caching/requireAuthorizationForCacheControl`,
    value: String(endpoint.perKeyInvalidation.requireAuthorization ?? true),
  });

  if (endpoint.perKeyInvalidation.handleUnauthorizedRequests) {
    ops.push({
      op: 'replace',
      path: `${methodPath}/caching/unauthorizedCacheControlHeaderStrategy`,
      value: mapUnauthorizedStrategy(endpoint.perKeyInvalidation.handleUnauthorizedRequests),
    });
  }

  return ops;
}

/**
 * Convert endpoint settings to an API Gateway method settings path.
 * e.g., '/users/{id}' + 'GET' → '/~1users~1{id}/GET'
 */
function toMethodPath(endpoint: EndpointSettings): string {
  // API Gateway uses ~1 as the path separator in method settings paths
  const escapedPath = endpoint.resourcePath.replace(/\//g, '~1');
  return `/${escapedPath}/${endpoint.httpMethod}`;
}

function mapUnauthorizedStrategy(
  strategy: 'Ignore' | 'IgnoreWithWarning' | 'Fail',
): string {
  const map: Record<string, string> = {
    Ignore: 'SUCCEED_WITHOUT_RESPONSE_HEADER',
    IgnoreWithWarning: 'SUCCEED_WITH_RESPONSE_HEADER',
    Fail: 'FAIL_WITH_403',
  };
  return map[strategy] ?? 'SUCCEED_WITHOUT_RESPONSE_HEADER';
}

/**
 * Retry an async operation with jittered exponential backoff.
 * Handles API Gateway ConflictException (stage update in progress).
 */
async function retryWithJitter(
  fn: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fn();
      return;
    } catch (error: unknown) {
      const isConflict =
        error instanceof Error &&
        (error.message.includes('ConflictException') ||
          error.message.includes('too many requests'));

      if (!isConflict || attempt === MAX_RETRIES) {
        throw error;
      }

      // Jittered exponential backoff: base * 2^attempt + random jitter
      const exponentialDelay = BASE_DELAY_MS * 2 ** attempt;
      const jitter = Math.random() * BASE_DELAY_MS;
      const delay = exponentialDelay + jitter;

      log(
        `[interlace-caching] Stage update conflict, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      );

      await sleep(delay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
