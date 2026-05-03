import { describe, it, expect } from 'vitest';
import { buildPatchOperations } from './stage-cache.js';
import type { ResolvedCachingSettings, EndpointSettings, StageMethodSettings } from './types.js';

function createEndpoint(overrides: Partial<EndpointSettings> = {}): EndpointSettings {
  return {
    resourcePath: '/test',
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
    gatewayResourceName: 'ApiGatewayMethodTestGet',
    isAdditionalEndpoint: false,
    functionName: 'testFn',
    ...overrides,
  };
}

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
    sharedApiGateway: false,
    endpoints: [],
    additionalEndpoints: [],
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

  it('sets global TTL and encryption when caching enabled', () => {
    const settings = createSettings({
      cachingEnabled: true,
      ttlInSeconds: 600,
      dataEncrypted: true,
    });
    const ops = buildPatchOperations(settings);

    expect(ops).toContainEqual({
      op: 'replace',
      path: '/*/*/caching/ttlInSeconds',
      value: '600',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/*/*/caching/dataEncrypted',
      value: 'true',
    });
  });

  it('generates per-endpoint operations', () => {
    const settings = createSettings({
      endpoints: [
        createEndpoint({
          resourcePath: '/users/{id}',
          httpMethod: 'GET',
          cachingEnabled: true,
          ttlInSeconds: 600,
          dataEncrypted: true,
          perKeyInvalidation: {
            requireAuthorization: true,
            handleUnauthorizedRequests: 'Fail',
          },
        }),
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
        createEndpoint({ resourcePath: '/users', httpMethod: 'GET' }),
        createEndpoint({ resourcePath: '/users/{id}', httpMethod: 'GET', ttlInSeconds: 600 }),
      ],
    });

    const ops = buildPatchOperations(settings);

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
          createEndpoint({
            perKeyInvalidation: {
              requireAuthorization: true,
              handleUnauthorizedRequests: input,
            },
          }),
        ],
      });

      const ops = buildPatchOperations(settings);
      const strategyOp = ops.find((op) =>
        op.path.includes('unauthorizedCacheControlHeaderStrategy'),
      );

      expect(strategyOp?.value).toBe(output);
    }
  });

  it('skips stage-level changes for shared API Gateway', () => {
    const settings = createSettings({
      sharedApiGateway: true,
      endpoints: [createEndpoint({ cachingEnabled: true })],
    });

    const ops = buildPatchOperations(settings);

    // Should NOT include stage-level operations
    expect(ops.find((op) => op.path === '/cacheClusterEnabled')).toBeUndefined();
    expect(ops.find((op) => op.path === '/cacheClusterSize')).toBeUndefined();
    expect(ops.find((op) => op.path === '/*/*/caching/enabled')).toBeUndefined();

    // Should still include per-endpoint operations
    expect(ops.find((op) => op.path.includes('/caching/enabled'))).toBeDefined();
  });

  it('handles ANY method — enables GET only', () => {
    const settings = createSettings({
      endpoints: [
        createEndpoint({
          httpMethod: 'ANY',
          cachingEnabled: true,
        }),
      ],
    });

    const ops = buildPatchOperations(settings);

    // GET should be enabled
    const getOp = ops.find((op) => op.path.includes('/GET/caching/enabled'));
    expect(getOp?.value).toBe('true');

    // Other methods should be explicitly disabled
    for (const method of ['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']) {
      const methodOp = ops.find((op) => op.path.includes(`/${method}/caching/enabled`));
      expect(methodOp?.value).toBe('false');
    }
  });

  it('inherits CloudWatch settings from stage', () => {
    const settings = createSettings({
      endpoints: [
        createEndpoint({
          inheritCloudWatchSettingsFromStage: true,
        }),
      ],
    });

    const stageMethodSettings: Record<string, StageMethodSettings> = {
      '*/*': {
        loggingLevel: 'INFO',
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    };

    const ops = buildPatchOperations(settings, stageMethodSettings);

    expect(ops).toContainEqual({
      op: 'replace',
      path: expect.stringContaining('/logging/loglevel'),
      value: 'INFO',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: expect.stringContaining('/logging/dataTrace'),
      value: 'true',
    });
    expect(ops).toContainEqual({
      op: 'replace',
      path: expect.stringContaining('/metrics/enabled'),
      value: 'true',
    });
  });

  it('includes additional endpoints in patch operations', () => {
    const settings = createSettings({
      additionalEndpoints: [
        createEndpoint({
          resourcePath: '/serverless',
          httpMethod: 'GET',
          cachingEnabled: true,
          isAdditionalEndpoint: true,
        }),
      ],
    });

    const ops = buildPatchOperations(settings);
    const additionalOps = ops.filter((op) => op.path.includes('~1serverless/GET'));
    expect(additionalOps.length).toBeGreaterThan(0);
  });
});
