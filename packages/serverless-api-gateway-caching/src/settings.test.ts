import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance } from './framework.js';
import { resolveSettings, buildGatewayResourceName } from './settings.js';

function createServerless(
  customConfig: Record<string, unknown> = {},
  functions: Record<string, unknown> = {},
): ServerlessInstance {
  const allFunctions = Object.keys(functions);
  return {
    service: {
      service: 'test-service',
      getServiceName: () => 'test-service',
      custom: customConfig,
      provider: {
        name: 'aws',
        stage: 'development',
        region: 'us-east-1',
        compiledCloudFormationTemplate: {
          Resources: {},
        },
      },
      functions: functions as ServerlessInstance['service']['functions'],
      getAllFunctions: () => allFunctions,
      getFunction: (name: string) => ({
        name,
        ...(functions[name] as Record<string, unknown>),
      }),
    },
    providers: {
      aws: {
        getStage: () => 'development',
        getRegion: () => 'us-east-1',
        getCredentials: () => ({}),
        request: vi.fn(),
      },
    },
    cli: {
      log: vi.fn(),
    },
  } as unknown as ServerlessInstance;
}

describe('resolveSettings', () => {
  it('returns defaults when no config is provided', () => {
    const serverless = createServerless();
    const settings = resolveSettings(serverless);

    expect(settings.cachingEnabled).toBe(false);
    expect(settings.clusterSize).toBe('0.5');
    expect(settings.ttlInSeconds).toBe(3600);
    expect(settings.dataEncrypted).toBe(false);
    expect(settings.flushOnDeploy).toBe(false);
    expect(settings.sharedApiGateway).toBe(false);
    expect(settings.endpoints).toHaveLength(0);
    expect(settings.additionalEndpoints).toHaveLength(0);
  });

  it('parses global caching config', () => {
    const serverless = createServerless({
      interlaceCaching: {
        enabled: true,
        clusterSize: '6.1',
        ttlInSeconds: 600,
        dataEncrypted: true,
        flushOnDeploy: true,
        sharedApiGateway: true,
      },
    });

    const settings = resolveSettings(serverless);

    expect(settings.cachingEnabled).toBe(true);
    expect(settings.clusterSize).toBe('6.1');
    expect(settings.ttlInSeconds).toBe(600);
    expect(settings.dataEncrypted).toBe(true);
    expect(settings.flushOnDeploy).toBe(true);
    expect(settings.sharedApiGateway).toBe(true);
  });

  it('extracts endpoints from function HTTP events', () => {
    const serverless = createServerless(
      { interlaceCaching: { enabled: true, ttlInSeconds: 300 } },
      {
        getUser: {
          handler: 'src/handler.get',
          events: [
            {
              http: {
                path: '/users/{id}',
                method: 'get',
                caching: {
                  enabled: true,
                  ttlInSeconds: 600,
                  cacheKeyParameters: [{ name: 'request.path.id' }],
                },
              },
            },
          ],
        },
        listUsers: {
          handler: 'src/handler.list',
          events: [
            {
              http: {
                path: '/users',
                method: 'get',
              },
            },
          ],
        },
      },
    );

    const settings = resolveSettings(serverless);

    expect(settings.endpoints).toHaveLength(2);

    const getUserEndpoint = settings.endpoints.find(
      (e) => e.resourcePath === '/users/{id}',
    );
    expect(getUserEndpoint).toBeDefined();
    expect(getUserEndpoint!.httpMethod).toBe('GET');
    expect(getUserEndpoint!.cachingEnabled).toBe(true);
    expect(getUserEndpoint!.ttlInSeconds).toBe(600);
    expect(getUserEndpoint!.cacheKeyParameters).toHaveLength(1);
    expect(getUserEndpoint!.cacheKeyParameters[0].name).toBe('request.path.id');

    const listUsersEndpoint = settings.endpoints.find(
      (e) => e.resourcePath === '/users',
    );
    expect(listUsersEndpoint).toBeDefined();
    expect(listUsersEndpoint!.cachingEnabled).toBe(false); // not explicitly enabled
  });

  it('endpoint config overrides global config', () => {
    const serverless = createServerless(
      {
        interlaceCaching: {
          enabled: true,
          ttlInSeconds: 300,
          dataEncrypted: false,
        },
      },
      {
        sensitiveEndpoint: {
          handler: 'src/handler.sensitive',
          events: [
            {
              http: {
                path: '/sensitive',
                method: 'get',
                caching: {
                  enabled: true,
                  ttlInSeconds: 60,
                  dataEncrypted: true,
                },
              },
            },
          ],
        },
      },
    );

    const settings = resolveSettings(serverless);
    const endpoint = settings.endpoints[0];

    expect(endpoint.ttlInSeconds).toBe(60); // overridden
    expect(endpoint.dataEncrypted).toBe(true); // overridden
  });

  it('parses string-form HTTP events ("GET /path") for parity with the community plugin', () => {
    const serverless = createServerless(
      { interlaceCaching: { enabled: true, ttlInSeconds: 600 } },
      {
        getUser: {
          handler: 'src/handler.get',
          events: [{ http: 'GET /users/{id}' }],
        },
        listUsers: {
          handler: 'src/handler.list',
          events: [{ http: 'get /users' }],
        },
      },
    );

    const settings = resolveSettings(serverless);

    expect(settings.endpoints).toHaveLength(2);

    const getUser = settings.endpoints.find(
      (e) => e.resourcePath === '/users/{id}',
    );
    expect(getUser).toBeDefined();
    expect(getUser!.httpMethod).toBe('GET');
    // String-form events can't carry per-endpoint caching config, so cachingEnabled
    // is false (the global flag still produces stage-level patches, but the method
    // itself is not enabled until the user switches to object form).
    expect(getUser!.cachingEnabled).toBe(false);

    const listUsers = settings.endpoints.find(
      (e) => e.resourcePath === '/users',
    );
    expect(listUsers).toBeDefined();
    expect(listUsers!.httpMethod).toBe('GET');
  });

  it('skips malformed string-form HTTP events', () => {
    const serverless = createServerless(
      { interlaceCaching: { enabled: true } },
      {
        broken: {
          handler: 'src/handler.broken',
          events: [{ http: 'just-one-token' }],
        },
      },
    );

    const settings = resolveSettings(serverless);
    expect(settings.endpoints).toHaveLength(0);
  });

  it('normalizes path with leading slash', () => {
    const serverless = createServerless(
      { interlaceCaching: { enabled: true } },
      {
        noSlash: {
          handler: 'src/handler.test',
          events: [
            {
              http: {
                path: 'no-leading-slash',
                method: 'get',
              },
            },
          ],
        },
      },
    );

    const settings = resolveSettings(serverless);
    expect(settings.endpoints[0].resourcePath).toBe('/no-leading-slash');
  });

  it('parses additional endpoints', () => {
    const serverless = createServerless({
      interlaceCaching: {
        enabled: true,
        additionalEndpoints: [
          {
            method: 'GET',
            path: '/serverless',
            caching: {
              enabled: true,
              ttlInSeconds: 1200,
            },
          },
          {
            method: 'GET',
            path: '/dynamodb',
            caching: {
              enabled: true,
              cacheKeyParameters: [{ name: 'request.querystring.id' }],
            },
          },
        ],
      },
    });

    const settings = resolveSettings(serverless);
    expect(settings.additionalEndpoints).toHaveLength(2);

    const slsEndpoint = settings.additionalEndpoints[0];
    expect(slsEndpoint.resourcePath).toBe('/serverless');
    expect(slsEndpoint.httpMethod).toBe('GET');
    expect(slsEndpoint.cachingEnabled).toBe(true);
    expect(slsEndpoint.ttlInSeconds).toBe(1200);
    expect(slsEndpoint.isAdditionalEndpoint).toBe(true);

    const dynamoEndpoint = settings.additionalEndpoints[1];
    expect(dynamoEndpoint.cacheKeyParameters).toHaveLength(1);
  });

  it('builds correct gateway resource names', () => {
    const serverless = createServerless(
      { interlaceCaching: { enabled: true } },
      {
        getUser: {
          handler: 'src/handler.get',
          events: [
            {
              http: {
                path: '/users/{id}',
                method: 'get',
                caching: { enabled: true },
              },
            },
          ],
        },
      },
    );

    const settings = resolveSettings(serverless);
    expect(settings.endpoints[0].gatewayResourceName).toBe(
      'ApiGatewayMethodUsersIdVarGet',
    );
  });

  it('prepends basePath for shared gateways', () => {
    const serverless = createServerless(
      {
        interlaceCaching: {
          enabled: true,
          sharedApiGateway: true,
          basePath: '/animals',
        },
      },
      {
        getCats: {
          handler: 'src/handler.get',
          events: [
            {
              http: {
                path: '/cats',
                method: 'get',
                caching: { enabled: true },
              },
            },
          ],
        },
      },
    );

    const settings = resolveSettings(serverless);
    expect(settings.endpoints[0].resourcePath).toBe('/animals/cats');
  });
});

describe('buildGatewayResourceName', () => {
  it('builds simple path', () => {
    expect(buildGatewayResourceName('/users', 'get')).toBe(
      'ApiGatewayMethodUsersGet',
    );
  });

  it('builds path with param', () => {
    expect(buildGatewayResourceName('/users/{id}', 'get')).toBe(
      'ApiGatewayMethodUsersIdVarGet',
    );
  });

  it('builds nested path', () => {
    expect(buildGatewayResourceName('/cats/{city}/{shelterId}', 'get')).toBe(
      'ApiGatewayMethodCatsCityVarShelteridVarGet',
    );
  });

  it('handles hyphens', () => {
    expect(buildGatewayResourceName('/my-resource', 'post')).toBe(
      'ApiGatewayMethodMyDashresourcePost',
    );
  });

  it('handles greedy path (+)', () => {
    expect(buildGatewayResourceName('/cats/{proxy+}', 'get')).toBe(
      'ApiGatewayMethodCatsProxyVarGet',
    );
  });

  it('handles root path', () => {
    expect(buildGatewayResourceName('/', 'get')).toBe('ApiGatewayMethodGet');
  });
});
