/**
 * Runtime behavior tests for stage-cache.ts (separate from buildPatchOperations
 * which is covered in stage-cache.test.ts).
 *
 * Focuses on: updateStageCache chunking, retryWithJitter, flushStageCache,
 * getStageState, ANY method handling, CloudWatch inheritance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AwsProvider } from './framework.js';
import {
  buildPatchOperations,
  updateStageCache,
  flushStageCache,
  getStageState,
} from './stage-cache.js';
import type {
  ResolvedCachingSettings,
  EndpointSettings,
  PatchOperation,
} from './types.js';

function endpoint(overrides: Partial<EndpointSettings> = {}): EndpointSettings {
  return {
    resourcePath: '/items/{id}',
    httpMethod: 'GET',
    cachingEnabled: true,
    ttlInSeconds: 300,
    dataEncrypted: false,
    perKeyInvalidation: {
      requireAuthorization: true,
      handleUnauthorizedRequests: 'Ignore',
    },
    cacheKeyParameters: [],
    inheritCloudWatchSettingsFromStage: true,
    gatewayResourceName: 'ApiGatewayMethodItemsIdVarGet',
    isAdditionalEndpoint: false,
    functionName: 'getItem',
    ...overrides,
  };
}

function settings(
  overrides: Partial<ResolvedCachingSettings> = {},
): ResolvedCachingSettings {
  return {
    cachingEnabled: true,
    clusterSize: '0.5',
    ttlInSeconds: 300,
    dataEncrypted: false,
    flushOnDeploy: false,
    perKeyInvalidation: {
      requireAuthorization: true,
      handleUnauthorizedRequests: 'Ignore',
    },
    sharedApiGateway: false,
    endpoints: [],
    additionalEndpoints: [],
    ...overrides,
  };
}

function provider(
  impl: (svc: string, method: string, params: unknown) => unknown = () => ({}),
): AwsProvider {
  return {
    getStage: () => 'development',
    getRegion: () => 'us-east-1',
    request: vi.fn(async (svc: string, method: string, params: unknown) => {
      const result = impl(svc, method, params);
      if (result instanceof Error) throw result;
      return (result ?? {}) as Record<string, unknown>;
    }),
  } as unknown as AwsProvider;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('updateStageCache (chunking + AWS API contract)', () => {
  it('returns immediately when there are no operations to apply', async () => {
    const p = provider(() => ({}));
    const log = vi.fn();
    await updateStageCache(p, 'api-1', 'development', [], log);
    expect((p.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(
      log.mock.calls
        .flat()
        .some((m) => String(m).includes('No cache operations')),
    ).toBe(true);
  });

  it('applies a single chunk when ops <= 80', async () => {
    const ops: PatchOperation[] = Array.from({ length: 50 }, (_, i) => ({
      op: 'replace' as const,
      path: `/path-${i}`,
      value: 'true',
    }));
    const p = provider(() => ({}));
    await updateStageCache(p, 'api-1', 'development', ops, vi.fn());
    const calls = (p.request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('APIGateway');
    expect(calls[0][1]).toBe('updateStage');
    const params = calls[0][2] as {
      restApiId: string;
      stageName: string;
      patchOperations: unknown[];
    };
    expect(params.restApiId).toBe('api-1');
    expect(params.stageName).toBe('development');
    expect(params.patchOperations).toHaveLength(50);
  });

  it('chunks operations into 80-op batches per AWS limit', async () => {
    const ops: PatchOperation[] = Array.from({ length: 200 }, (_, i) => ({
      op: 'replace' as const,
      path: `/path-${i}`,
      value: 'true',
    }));
    const p = provider(() => ({}));
    await updateStageCache(p, 'api-1', 'development', ops, vi.fn());
    const calls = (p.request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3); // 80 + 80 + 40
    expect(
      (calls[0][2] as { patchOperations: unknown[] }).patchOperations,
    ).toHaveLength(80);
    expect(
      (calls[1][2] as { patchOperations: unknown[] }).patchOperations,
    ).toHaveLength(80);
    expect(
      (calls[2][2] as { patchOperations: unknown[] }).patchOperations,
    ).toHaveLength(40);
  });

  it('retries on ConflictException with jittered exponential backoff', async () => {
    let attempts = 0;
    const p = provider(() => {
      attempts++;
      if (attempts <= 2) {
        const err = new Error('A previous change is still in progress');
        return err;
      }
      return {};
    });
    const log = vi.fn();
    const promise = updateStageCache(
      p,
      'api-1',
      'development',
      [{ op: 'replace', path: '/x', value: 'y' }],
      log,
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(attempts).toBe(3); // 2 conflicts + 1 success
    const calls = (p.request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    // Conflict-retry log lines fired
    const messages = log.mock.calls.flat().map(String);
    expect(
      messages.filter((m) => m.includes('conflict, retrying')).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('throws after MAX_RETRIES on persistent ConflictException', async () => {
    const p = provider(() => new Error('ConflictException: still in progress'));
    const log = vi.fn();
    const promise = updateStageCache(
      p,
      'api-1',
      'development',
      [{ op: 'replace', path: '/x', value: 'y' }],
      log,
    );
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await expectation;
    // 1 initial + 5 retries = 6 attempts (MAX_RETRIES = 5)
    expect((p.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(6);
  });

  it('throws immediately on non-retryable error', async () => {
    const p = provider(
      () => new Error('AccessDeniedException: not authorized'),
    );
    const log = vi.fn();
    await expect(
      updateStageCache(
        p,
        'api-1',
        'development',
        [{ op: 'replace', path: '/x', value: 'y' }],
        log,
      ),
    ).rejects.toThrow(/AccessDeniedException/);
    // Only 1 attempt, no retries
    expect((p.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('also retries on "too many requests" error message', async () => {
    let attempts = 0;
    const p = provider(() => {
      attempts++;
      if (attempts === 1) return new Error('too many requests, slow down');
      return {};
    });
    const promise = updateStageCache(
      p,
      'api-1',
      'development',
      [{ op: 'replace', path: '/x', value: 'y' }],
      vi.fn(),
    );
    await vi.runAllTimersAsync();
    await promise;
    expect(attempts).toBe(2);
  });
});

describe('flushStageCache', () => {
  it('calls APIGateway.flushStageCache and logs success', async () => {
    const p = provider(() => ({}));
    const log = vi.fn();
    await flushStageCache(p, 'api-1', 'production', log);
    const calls = (p.request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(['APIGateway', 'flushStageCache']);
    expect(calls[0][2]).toEqual({
      restApiId: 'api-1',
      stageName: 'production',
    });
    const messages = log.mock.calls.flat().map(String);
    expect(messages.some((m) => m.includes('Flushing stage cache'))).toBe(true);
    expect(messages.some((m) => m.includes('flushed successfully'))).toBe(true);
  });

  it('retries flushStageCache on ConflictException then succeeds', async () => {
    let attempts = 0;
    const p = provider(() => {
      attempts++;
      if (attempts === 1) return new Error('ConflictException');
      return {};
    });
    const promise = flushStageCache(p, 'api-1', 'development', vi.fn());
    await vi.runAllTimersAsync();
    await promise;
    expect(attempts).toBe(2);
  });
});

describe('getStageState', () => {
  it('returns methodSettings from APIGateway.getStage', async () => {
    const p = provider((svc, method) => {
      if (method === 'getStage') {
        return {
          methodSettings: {
            '*/*': {
              loggingLevel: 'INFO',
              dataTraceEnabled: true,
              metricsEnabled: true,
            },
          },
        };
      }
      return {};
    });
    const state = await getStageState(p, 'api-1', 'development');
    expect(state['*/*']).toEqual({
      loggingLevel: 'INFO',
      dataTraceEnabled: true,
      metricsEnabled: true,
    });
  });

  it('returns empty object when getStage returns no methodSettings', async () => {
    const p = provider(() => ({}));
    const state = await getStageState(p, 'api-1', 'development');
    expect(state).toEqual({});
  });

  it('swallows getStage errors and returns empty object', async () => {
    const p = provider(() => new Error('stage not found'));
    const state = await getStageState(p, 'api-1', 'nonexistent');
    expect(state).toEqual({});
  });
});

describe('buildPatchOperations — additional ANY-method scenarios', () => {
  it('ANY method generates disable patches for non-GET methods then enables GET', () => {
    const ops = buildPatchOperations(
      settings({
        endpoints: [
          endpoint({
            resourcePath: '/proxy',
            httpMethod: 'ANY',
            cachingEnabled: true,
          }),
        ],
      }),
    );
    const nonGetMethods = ['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'];
    for (const m of nonGetMethods) {
      const op = ops.find((o) => o.path === `/~1proxy/${m}/caching/enabled`);
      expect(op?.value).toBe('false');
    }
    const get = ops.find((o) => o.path === '/~1proxy/GET/caching/enabled');
    expect(get?.value).toBe('true');
  });

  it('escapes "~" in path correctly per JSON Pointer rules', () => {
    const ops = buildPatchOperations(
      settings({
        endpoints: [
          endpoint({ resourcePath: '/with~tilde', gatewayResourceName: 'X' }),
        ],
      }),
    );
    expect(ops.some((o) => o.path.startsWith('/~1with~0tilde/GET'))).toBe(true);
  });

  it('emits stage-level ttl/dataEncrypted defaults only when caching is enabled', () => {
    const opsDisabled = buildPatchOperations(
      settings({ cachingEnabled: false }),
    );
    expect(opsDisabled.some((o) => o.path === '/cacheClusterSize')).toBe(false);
    expect(
      opsDisabled.some((o) => o.path === '/*/*/caching/ttlInSeconds'),
    ).toBe(false);
    expect(
      opsDisabled.some((o) => o.path === '/*/*/caching/dataEncrypted'),
    ).toBe(false);
  });
});
