/**
 * @interlace/serverless-plugin-caching — Stage cache operations
 *
 * Handles post-deploy API Gateway stage updates:
 * - Enable/disable cache cluster
 * - Set per-method caching, TTL, encryption, invalidation
 * - CloudWatch settings inheritance from stage
 * - ANY method → GET-only caching
 * - Shared API Gateway support
 * - Chunked patch operations (AWS limit: 80 per call)
 * - Jittered exponential backoff for ConflictException retries
 */

import type { AwsProvider } from '@interlace/serverless-devkit';
import type {
  ResolvedCachingSettings,
  PatchOperation,
  EndpointSettings,
  StageMethodSettings,
} from './types.js';

/** AWS API limit for patch operations per UpdateStage call */
const MAX_PATCH_OPERATIONS = 80;

/** Retry configuration */
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/** HTTP methods to disable caching for when method is ANY */
const NON_GET_METHODS = ['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'];

/**
 * Build all patch operations needed to configure the stage cache.
 */
export function buildPatchOperations(
  settings: ResolvedCachingSettings,
  stageMethodSettings?: Record<string, StageMethodSettings>,
): PatchOperation[] {
  const ops: PatchOperation[] = [];

  // For shared gateways, skip stage-level changes entirely
  if (settings.sharedApiGateway) {
    // Only apply per-endpoint settings, not cluster-level
    const allEndpoints = [...settings.endpoints, ...settings.additionalEndpoints];
    for (const endpoint of allEndpoints) {
      ops.push(...buildEndpointOps(endpoint, stageMethodSettings));
    }
    return ops;
  }

  // Global: disable all method caching first
  ops.push({
    op: 'replace',
    path: '/*/*/caching/enabled',
    value: 'false',
  });

  // Stage-level cache cluster
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

    // Global defaults for TTL and encryption
    ops.push({
      op: 'replace',
      path: '/*/*/caching/dataEncrypted',
      value: String(settings.dataEncrypted),
    });

    ops.push({
      op: 'replace',
      path: '/*/*/caching/ttlInSeconds',
      value: String(settings.ttlInSeconds),
    });
  }

  // Per-endpoint settings
  const allEndpoints = [...settings.endpoints, ...settings.additionalEndpoints];
  for (const endpoint of allEndpoints) {
    ops.push(...buildEndpointOps(endpoint, stageMethodSettings));
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

/**
 * Retrieve the current stage state (for CloudWatch settings inheritance).
 */
export async function getStageState(
  provider: AwsProvider,
  restApiId: string,
  stageName: string,
): Promise<Record<string, StageMethodSettings>> {
  try {
    const response = await provider.request('APIGateway', 'getStage', {
      restApiId,
      stageName,
    });
    return (response.methodSettings ?? {}) as Record<string, StageMethodSettings>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildEndpointOps(
  endpoint: EndpointSettings,
  stageMethodSettings?: Record<string, StageMethodSettings>,
): PatchOperation[] {
  // Handle ANY method: enable GET, disable all others
  if (endpoint.httpMethod === 'ANY') {
    return buildAnyMethodOps(endpoint, stageMethodSettings);
  }

  return buildMethodOps(
    endpoint.resourcePath,
    endpoint.httpMethod,
    endpoint,
    stageMethodSettings,
  );
}

/**
 * For ANY method: enable caching only for GET, explicitly disable all other methods.
 */
function buildAnyMethodOps(
  endpoint: EndpointSettings,
  stageMethodSettings?: Record<string, StageMethodSettings>,
): PatchOperation[] {
  const ops: PatchOperation[] = [];

  // Disable caching for non-GET methods
  for (const method of NON_GET_METHODS) {
    ops.push(...buildMethodOps(
      endpoint.resourcePath,
      method,
      { ...endpoint, cachingEnabled: false },
      undefined,
    ));
  }

  // Enable caching for GET only
  ops.push(...buildMethodOps(
    endpoint.resourcePath,
    'GET',
    endpoint,
    stageMethodSettings,
  ));

  return ops;
}

function buildMethodOps(
  path: string,
  method: string,
  endpoint: EndpointSettings,
  stageMethodSettings?: Record<string, StageMethodSettings>,
): PatchOperation[] {
  const ops: PatchOperation[] = [];
  const methodPath = toMethodPath(path, method);

  ops.push({
    op: 'replace',
    path: `${methodPath}/caching/enabled`,
    value: String(endpoint.cachingEnabled),
  });

  if (endpoint.cachingEnabled) {
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
  }

  if (endpoint.perKeyInvalidation) {
    ops.push({
      op: 'replace',
      path: `${methodPath}/caching/requireAuthorizationForCacheControl`,
      value: String(endpoint.perKeyInvalidation.requireAuthorization ?? true),
    });

    if (endpoint.perKeyInvalidation.requireAuthorization) {
      ops.push({
        op: 'replace',
        path: `${methodPath}/caching/unauthorizedCacheControlHeaderStrategy`,
        value: mapUnauthorizedStrategy(
          endpoint.perKeyInvalidation.handleUnauthorizedRequests ?? 'Ignore',
        ),
      });
    }
  }

  // CloudWatch settings inheritance from stage */* defaults
  if (endpoint.inheritCloudWatchSettingsFromStage && stageMethodSettings?.['*/*']) {
    const stageDefaults = stageMethodSettings['*/*'];

    if (stageDefaults.loggingLevel) {
      ops.push({
        op: 'replace',
        path: `${methodPath}/logging/loglevel`,
        value: stageDefaults.loggingLevel,
      });
    }

    ops.push({
      op: 'replace',
      path: `${methodPath}/logging/dataTrace`,
      value: stageDefaults.dataTraceEnabled ? 'true' : 'false',
    });

    ops.push({
      op: 'replace',
      path: `${methodPath}/metrics/enabled`,
      value: stageDefaults.metricsEnabled ? 'true' : 'false',
    });
  }

  return ops;
}

/**
 * Convert resource path + method to API Gateway method settings path.
 * e.g., '/users/{id}' + 'GET' → '/~1users~1{id}/GET'
 *
 * Escaping rules (JSON Pointer / AWS API Gateway):
 * - '~' → '~0'
 * - '/' → '~1'
 */
function toMethodPath(path: string, method: string): string {
  const escaped = path
    .replace(/~/g, '~0')
    .replace(/\//g, '~1');

  return `/${escaped}/${method.toUpperCase()}`;
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
          error.message.includes('too many requests') ||
          error.message.includes('A previous change is still in progress'));

      if (!isConflict || attempt === MAX_RETRIES) {
        throw error;
      }

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
