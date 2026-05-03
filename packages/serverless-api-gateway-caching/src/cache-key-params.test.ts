import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance } from './framework.js';
import { addCacheKeyParametersToTemplate } from './cache-key-params.js';
import type { ResolvedCachingSettings, EndpointSettings } from './types.js';

interface MethodResource {
  Type: string;
  Properties?: {
    RequestParameters?: Record<string, boolean>;
    Integration?: {
      Type?: string;
      RequestParameters?: Record<string, string>;
      CacheKeyParameters?: string[];
      CacheNamespace?: string;
    };
  };
}

function createServerless(
  resources: Record<string, MethodResource>,
): ServerlessInstance {
  return {
    service: {
      provider: {
        compiledCloudFormationTemplate: { Resources: resources },
      },
    },
    cli: { log: vi.fn() },
  } as unknown as ServerlessInstance;
}

function createEndpoint(
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

function createSettings(
  endpoints: EndpointSettings[],
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
    endpoints,
    additionalEndpoints: [],
  };
}

describe('addCacheKeyParametersToTemplate', () => {
  it('applies a single-value query string cache key param', () => {
    const resources: Record<string, MethodResource> = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    const settings = createSettings([
      createEndpoint({
        cacheKeyParameters: [{ name: 'request.querystring.page' }],
      }),
    ]);

    addCacheKeyParametersToTemplate(createServerless(resources), settings);

    const integration =
      resources.ApiGatewayMethodItemsGet.Properties!.Integration!;
    expect(integration.CacheKeyParameters).toContain(
      'method.request.querystring.page',
    );
    expect(integration.RequestParameters).toEqual({
      'integration.request.querystring.page': 'method.request.querystring.page',
    });
    expect(
      resources.ApiGatewayMethodItemsGet.Properties!.RequestParameters,
    ).toEqual({
      'method.request.querystring.page': false,
    });
  });

  it('combines path, query, and header cache key params on one method', () => {
    const resources: Record<string, MethodResource> = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    const settings = createSettings([
      createEndpoint({
        cacheKeyParameters: [
          { name: 'request.path.id' },
          { name: 'request.querystring.page' },
          { name: 'request.header.Accept-Language' },
        ],
      }),
    ]);

    addCacheKeyParametersToTemplate(createServerless(resources), settings);

    const integration =
      resources.ApiGatewayMethodItemsGet.Properties!.Integration!;
    expect(integration.CacheKeyParameters).toEqual([
      'method.request.path.id',
      'method.request.querystring.page',
      'method.request.header.Accept-Language',
    ]);
    expect(integration.CacheNamespace).toBe('ApiGatewayMethodItemsGetCacheNS');
  });

  it('honors a mappedFrom that targets a body integration source', () => {
    const resources: Record<string, MethodResource> = {
      ApiGatewayMethodItemsGet: { Type: 'AWS::ApiGateway::Method' },
    };
    const settings = createSettings([
      createEndpoint({
        cacheKeyParameters: [
          {
            name: 'integration.request.header.cityCount',
            mappedFrom: 'method.request.body.cities[0].petCount',
          },
        ],
      }),
    ]);

    addCacheKeyParametersToTemplate(createServerless(resources), settings);

    const props = resources.ApiGatewayMethodItemsGet.Properties!;
    // body source isn't a method.request.path/querystring/header — RequestParameters stays empty
    expect(props.RequestParameters).toEqual({});
    expect(props.Integration!.RequestParameters).toEqual({
      'integration.request.header.cityCount':
        'method.request.body.cities[0].petCount',
    });
    expect(props.Integration!.CacheKeyParameters).toContain(
      'integration.request.header.cityCount',
    );
  });

  it('skips integration RequestParameters for AWS_PROXY integration', () => {
    const resources: Record<string, MethodResource> = {
      ApiGatewayMethodItemsGet: {
        Type: 'AWS::ApiGateway::Method',
        Properties: { Integration: { Type: 'AWS_PROXY' } },
      },
    };
    const settings = createSettings([
      createEndpoint({
        cacheKeyParameters: [{ name: 'request.querystring.page' }],
      }),
    ]);

    addCacheKeyParametersToTemplate(createServerless(resources), settings);

    const integration =
      resources.ApiGatewayMethodItemsGet.Properties!.Integration!;
    expect(integration.CacheKeyParameters).toContain(
      'method.request.querystring.page',
    );
    // AWS_PROXY: must NOT add integration.request.* mapping (causes 500s)
    expect(integration.RequestParameters).toEqual({});
  });
});
