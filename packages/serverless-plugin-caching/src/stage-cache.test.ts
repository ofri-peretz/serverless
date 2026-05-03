import { describe, it, expect } from 'vitest';
import { buildPatchOperations } from './stage-cache.js';
import type { ResolvedCachingSettings } from './types.js';

function createSettings(
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
    endpoints: [],
    ...overrides,
  };
}

describe('buildPatchOperations', () => {
  it('generates global cache cluster operations when enabled', () => {
    const settings = createSettings({ cachingEnabled: true, clusterSize: '1.6' });
    const ops = buildPatchOperations(settings);

    expect(ops).toContainEqual({
      op: 'replace',
      path: '/cacheClusterEnabled',
      value: 'true',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/cacheClusterSize',
      value: '1.6',
    });
  });

  it('disables cache cluster when cachingEnabled is false', () => {
    const settings = createSettings({ cachingEnabled: false });
    const ops = buildPatchOperations(settings);

    expect(ops).toContainEqual({
      op: 'replace',
      path: '/cacheClusterEnabled',
      value: 'false',
    });
    // Should NOT include clusterSize when disabled
    expect(ops.find((op) => op.path === '/cacheClusterSize')).toBeUndefined();
  });

  it('generates per-endpoint operations', () => {
    const settings = createSettings({
      endpoints: [
        {
          resourcePath: '/users/{id}',
          httpMethod: 'GET',
          cachingEnabled: true,
          ttlInSeconds: 600,
          dataEncrypted: true,
          perKeyInvalidation: {
            requireAuthorization: true,
            handleUnauthorizedRequests: 'Fail',
          },
          cacheKeyParameters: [],
        },
      ],
    });

    const ops = buildPatchOperations(settings);

    expect(ops).toContainEqual({
      op: 'replace',
      path: '/~1users~1{id}/GET/caching/enabled',
      value: 'true',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/~1users~1{id}/GET/caching/ttlInSeconds',
      value: '600',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/~1users~1{id}/GET/caching/dataEncrypted',
      value: 'true',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/~1users~1{id}/GET/caching/unauthorizedCacheControlHeaderStrategy',
      value: 'FAIL_WITH_403',
    });
  });

  it('disables all methods by default before enabling specific ones', () => {
    const settings = createSettings();
    const ops = buildPatchOperations(settings);

    expect(ops[0]).toEqual({
      op: 'replace',
      path: '/*/*/caching/enabled',
      value: 'false',
    });
  });

  it('handles multiple endpoints', () => {
    const settings = createSettings({
      endpoints: [
        {
          resourcePath: '/users',
          httpMethod: 'GET',
          cachingEnabled: true,
          ttlInSeconds: 300,
          dataEncrypted: false,
          perKeyInvalidation: { requireAuthorization: false },
          cacheKeyParameters: [],
        },
        {
          resourcePath: '/users/{id}',
          httpMethod: 'GET',
          cachingEnabled: true,
          ttlInSeconds: 600,
          dataEncrypted: true,
          perKeyInvalidation: { requireAuthorization: true },
          cacheKeyParameters: [],
        },
      ],
    });

    const ops = buildPatchOperations(settings);

    // Should have ops for both endpoints
    const usersOps = ops.filter((op) => op.path.includes('~1users/GET'));
    const userIdOps = ops.filter((op) => op.path.includes('~1users~1{id}/GET'));

    expect(usersOps.length).toBeGreaterThan(0);
    expect(userIdOps.length).toBeGreaterThan(0);
  });

  it('maps unauthorized strategies correctly', () => {
    const strategies: Array<{
      input: 'Ignore' | 'IgnoreWithWarning' | 'Fail';
      output: string;
    }> = [
      { input: 'Ignore', output: 'SUCCEED_WITHOUT_RESPONSE_HEADER' },
      { input: 'IgnoreWithWarning', output: 'SUCCEED_WITH_RESPONSE_HEADER' },
      { input: 'Fail', output: 'FAIL_WITH_403' },
    ];

    for (const { input, output } of strategies) {
      const settings = createSettings({
        endpoints: [
          {
            resourcePath: '/test',
            httpMethod: 'GET',
            cachingEnabled: true,
            ttlInSeconds: 300,
            dataEncrypted: false,
            perKeyInvalidation: {
              requireAuthorization: true,
              handleUnauthorizedRequests: input,
            },
            cacheKeyParameters: [],
          },
        ],
      });

      const ops = buildPatchOperations(settings);
      const strategyOp = ops.find((op) =>
        op.path.includes('unauthorizedCacheControlHeaderStrategy'),
      );

      expect(strategyOp?.value).toBe(output);
    }
  });
});
