/**
 * Edge-case tests targeting the remaining uncovered branches across the codebase.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance, AwsProvider } from './framework.js';
import { resolveSettings } from './settings.js';
import { addCacheKeyParametersToTemplate } from './cache-key-params.js';
import { buildPatchOperations } from './stage-cache.js';
import InterlaceCachingPlugin from './index.js';
import type { ResolvedCachingSettings, EndpointSettings } from './types.js';

function makeServerless(
  custom: Record<string, unknown>,
  functions: Record<string, unknown> = {},
): ServerlessInstance {
  const fnNames = Object.keys(functions);
  return {
    service: {
      service: 'demo',
      getServiceName: () => 'demo',
      custom,
      provider: {
        name: 'aws',
        stage: 'development',
        region: 'us-east-1',
        compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
      },
      functions: functions as ServerlessInstance['service']['functions'],
      getAllFunctions: () => fnNames,
      getFunction: (name: string) => ({
        name,
        ...(functions[name] as Record<string, unknown>),
      }),
    },
    providers: {
      aws: {
        getStage: () => 'development',
        getRegion: () => 'us-east-1',
        request: vi.fn(async () => ({})),
      } as unknown as AwsProvider,
    },
    cli: { log: vi.fn() },
    configSchemaHandler: undefined,
  } as unknown as ServerlessInstance;
}

describe('settings — trailing-slash normalization', () => {
  it('strips trailing slash from a function event path', () => {
    const sls = makeServerless(
      { interlaceCaching: { enabled: true } },
      {
        getItem: {
          handler: 'h',
          events: [
            {
              http: {
                path: '/items/{id}/',
                method: 'get',
                caching: { enabled: true },
              },
            },
          ],
        },
      },
    );
    const settings = resolveSettings(sls);
    expect(settings.endpoints[0].resourcePath).toBe('/items/{id}');
  });

  it('preserves the root path "/" without stripping', () => {
    const sls = makeServerless(
      { interlaceCaching: { enabled: true } },
      {
        root: {
          handler: 'h',
          events: [{ http: { path: '/', method: 'get' } }],
        },
      },
    );
    const settings = resolveSettings(sls);
    expect(settings.endpoints[0].resourcePath).toBe('/');
  });

  it('strips trailing slash from additional endpoint paths', () => {
    const sls = makeServerless({
      interlaceCaching: {
        enabled: true,
        additionalEndpoints: [{ method: 'GET', path: '/proxy/' }],
      },
    });
    const settings = resolveSettings(sls);
    expect(settings.additionalEndpoints[0].resourcePath).toBe('/proxy');
  });

  it('strips trailing slash from configured basePath', () => {
    const sls = makeServerless(
      {
        interlaceCaching: {
          enabled: true,
          sharedApiGateway: true,
          basePath: '/animals/',
        },
      },
      {
        getCat: {
          handler: 'h',
          events: [{ http: { path: '/cats', method: 'get' } }],
        },
      },
    );
    const settings = resolveSettings(sls);
    expect(settings.basePath).toBe('/animals');
    expect(settings.endpoints[0].resourcePath).toBe('/animals/cats');
  });
});

describe('cache-key-params — mappedFrom branches & legacy shorthand', () => {
  function endpoint(
    overrides: Partial<EndpointSettings> = {},
  ): EndpointSettings {
    return {
      resourcePath: '/items',
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
      gatewayResourceName: 'ApiGatewayMethodItemsGet',
      isAdditionalEndpoint: false,
      functionName: 'list',
      ...overrides,
    };
  }
  function settings(endpoints: EndpointSettings[]): ResolvedCachingSettings {
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
      endpoints,
      additionalEndpoints: [],
    };
  }
  function makeSlsForCfMutation(
    resources: Record<string, unknown>,
  ): ServerlessInstance {
    return {
      service: {
        provider: { compiledCloudFormationTemplate: { Resources: resources } },
      },
      cli: { log: vi.fn() },
    } as unknown as ServerlessInstance;
  }

  it('mappedFrom targeting method.request.path adds RequestParameters entry', () => {
    const resources = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([
        endpoint({
          cacheKeyParameters: [
            {
              name: 'integration.request.querystring.id',
              mappedFrom: 'method.request.path.id',
            },
          ],
        }),
      ]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { RequestParameters: Record<string, boolean> };
    };
    expect(r.Properties.RequestParameters).toEqual({
      'method.request.path.id': false,
    });
  });

  it('mappedFrom targeting method.request.header adds RequestParameters entry', () => {
    const resources = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([
        endpoint({
          cacheKeyParameters: [
            {
              name: 'integration.request.querystring.lang',
              mappedFrom: 'method.request.header.Accept-Language',
            },
          ],
        }),
      ]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { RequestParameters: Record<string, boolean> };
    };
    expect(r.Properties.RequestParameters).toEqual({
      'method.request.header.Accept-Language': false,
    });
  });

  it('legacy shorthand "querystring.X" auto-prefixes to "request.querystring.X"', () => {
    const resources = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([
        endpoint({ cacheKeyParameters: [{ name: 'querystring.page' }] }),
      ]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { Integration: { CacheKeyParameters: string[] } };
    };
    expect(r.Properties.Integration.CacheKeyParameters).toContain(
      'method.request.querystring.page',
    );
  });

  it('legacy shorthand "path.X" auto-prefixes', () => {
    const resources = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([endpoint({ cacheKeyParameters: [{ name: 'path.id' }] })]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { Integration: { CacheKeyParameters: string[] } };
    };
    expect(r.Properties.Integration.CacheKeyParameters).toContain(
      'method.request.path.id',
    );
  });

  it('passes through a name that has no recognized prefix unchanged', () => {
    const resources = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([endpoint({ cacheKeyParameters: [{ name: 'custom.thing' }] })]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { Integration: { CacheKeyParameters: string[] } };
    };
    expect(r.Properties.Integration.CacheKeyParameters).toContain(
      'method.custom.thing',
    );
  });

  it('logs a warning and skips when the gateway resource is missing from CF template', () => {
    const resources: Record<string, unknown> = {};
    const log = vi.fn();
    const sls = {
      service: {
        provider: { compiledCloudFormationTemplate: { Resources: resources } },
      },
      cli: { log },
    } as unknown as ServerlessInstance;
    addCacheKeyParametersToTemplate(
      sls,
      settings([
        endpoint({
          cacheKeyParameters: [{ name: 'request.querystring.page' }],
        }),
      ]),
    );
    expect(
      log.mock.calls
        .flat()
        .some((m) => String(m).includes('Could not find CF resource')),
    ).toBe(true);
  });

  it('skips endpoints with no cacheKeyParameters', () => {
    const resources = {
      ApiGatewayMethodItemsGet: {
        Type: 'AWS::ApiGateway::Method',
        Properties: {},
      },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([endpoint({ cacheKeyParameters: [] })]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { Integration?: unknown };
    };
    // No mutation should have happened
    expect(r.Properties.Integration).toBeUndefined();
  });

  it('skips disabled endpoints even if cacheKeyParameters are declared', () => {
    const resources = {
      ApiGatewayMethodItemsGet: {
        Type: 'AWS::ApiGateway::Method',
        Properties: {},
      },
    };
    addCacheKeyParametersToTemplate(
      makeSlsForCfMutation(resources),
      settings([
        endpoint({
          cachingEnabled: false,
          cacheKeyParameters: [{ name: 'request.querystring.page' }],
        }),
      ]),
    );
    const r = resources.ApiGatewayMethodItemsGet as {
      Properties: { Integration?: unknown };
    };
    expect(r.Properties.Integration).toBeUndefined();
  });
});

describe('preview — fallback when getStage throws', () => {
  it('continues with empty stageMethodSettings when getStageState fails', async () => {
    const calls: Array<{ method: string }> = [];
    const sls = {
      service: {
        service: 'demo',
        getServiceName: () => 'demo',
        custom: { interlaceCaching: { enabled: true, restApiId: 'api-x' } },
        provider: {
          name: 'aws',
          stage: 'development',
          region: 'us-east-1',
          compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
        },
        functions: {},
        getAllFunctions: () => [],
        getFunction: (name: string) => ({ name }),
      },
      providers: {
        aws: {
          getStage: () => 'development',
          getRegion: () => 'us-east-1',
          request: vi.fn(async (_svc: string, method: string) => {
            calls.push({ method });
            // getStage throws — preview must NOT propagate the error
            if (method === 'getStage')
              throw new Error('AccessDenied: not authorized');
            return {};
          }),
        },
      },
      cli: { log: vi.fn() },
      configSchemaHandler: undefined,
    } as unknown as ServerlessInstance;

    const plugin = new InterlaceCachingPlugin(sls, { stage: 'development' });
    await expect(
      plugin.hooks['caching:preview:show'](),
    ).resolves.toBeUndefined();
    expect(calls.some((c) => c.method === 'getStage')).toBe(true);
    // No write APIs called
    expect(
      calls.some(
        (c) => c.method === 'updateStage' || c.method === 'flushStageCache',
      ),
    ).toBe(false);
  });

  it('handles cachingEnabled: false (prints "Cluster: disabled" branch)', async () => {
    const logs: string[] = [];
    const sls = {
      service: {
        service: 'demo',
        getServiceName: () => 'demo',
        custom: { interlaceCaching: { enabled: false, restApiId: 'api-x' } },
        provider: {
          name: 'aws',
          stage: 'development',
          region: 'us-east-1',
          compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
        },
        functions: {},
        getAllFunctions: () => [],
        getFunction: (name: string) => ({ name }),
      },
      providers: {
        aws: {
          getStage: () => 'development',
          getRegion: () => 'us-east-1',
          request: vi.fn(async () => ({})),
        },
      },
      cli: {
        log: vi.fn((m: string) => {
          logs.push(m);
        }),
      },
      configSchemaHandler: undefined,
    } as unknown as ServerlessInstance;

    const plugin = new InterlaceCachingPlugin(sls, {});
    await plugin.hooks['caching:preview:show']();
    expect(logs.some((m) => m.includes('Cluster:    disabled'))).toBe(true);
  });
});

describe('buildPatchOperations — CloudWatch inheritance branch coverage', () => {
  it('skips CloudWatch logging level patch when stage has no loggingLevel', () => {
    const ops = buildPatchOperations(
      {
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
        endpoints: [
          {
            resourcePath: '/x',
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
            gatewayResourceName: 'X',
            isAdditionalEndpoint: false,
            functionName: 'fn',
          },
        ],
        additionalEndpoints: [],
      },
      {
        '*/*': { dataTraceEnabled: false, metricsEnabled: false }, // no loggingLevel
      },
    );
    // Should NOT include logging/loglevel since loggingLevel was undefined
    expect(ops.some((o) => o.path.endsWith('/logging/loglevel'))).toBe(false);
    // But dataTrace + metrics should still be set
    expect(ops.some((o) => o.path.endsWith('/logging/dataTrace'))).toBe(true);
    expect(ops.some((o) => o.path.endsWith('/metrics/enabled'))).toBe(true);
  });
});
