import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance } from '@interlace/serverless-devkit';
import { resolveSettings } from './settings.js';

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
        stage: 'dev',
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
        getStage: () => 'dev',
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
    expect(settings.ttlInSeconds).toBe(300);
    expect(settings.dataEncrypted).toBe(false);
    expect(settings.flushOnDeploy).toBe(false);
    expect(settings.endpoints).toHaveLength(0);
  });

  it('parses global caching config', () => {
    const serverless = createServerless({
      interlaceCaching: {
        enabled: true,
        clusterSize: '6.1',
        ttlInSeconds: 600,
        dataEncrypted: true,
        flushOnDeploy: true,
      },
    });

    const settings = resolveSettings(serverless);

    expect(settings.cachingEnabled).toBe(true);
    expect(settings.clusterSize).toBe('6.1');
    expect(settings.ttlInSeconds).toBe(600);
    expect(settings.dataEncrypted).toBe(true);
    expect(settings.flushOnDeploy).toBe(true);
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

    const getUserEndpoint = settings.endpoints.find((e) => e.resourcePath === '/users/{id}');
    expect(getUserEndpoint).toBeDefined();
    expect(getUserEndpoint!.httpMethod).toBe('GET');
    expect(getUserEndpoint!.cachingEnabled).toBe(true);
    expect(getUserEndpoint!.ttlInSeconds).toBe(600);
    expect(getUserEndpoint!.cacheKeyParameters).toHaveLength(1);
    expect(getUserEndpoint!.cacheKeyParameters[0].name).toBe('request.path.id');

    const listUsersEndpoint = settings.endpoints.find((e) => e.resourcePath === '/users');
    expect(listUsersEndpoint).toBeDefined();
    expect(listUsersEndpoint!.cachingEnabled).toBe(true); // inherits from global
    expect(listUsersEndpoint!.ttlInSeconds).toBe(300); // inherits from global
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

  it('normalizes path with leading slash', () => {
    const serverless = createServerless({}, {
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
    });

    const settings = resolveSettings(serverless);
    expect(settings.endpoints[0].resourcePath).toBe('/no-leading-slash');
  });
});
