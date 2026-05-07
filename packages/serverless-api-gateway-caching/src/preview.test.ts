import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance } from './framework.js';
import InterlaceCachingPlugin from './index.js';

const READ_ONLY_METHODS = new Set([
  'getStage',
  'describeStackResource',
  'describeStacks',
]);

const WRITE_METHODS = new Set(['updateStage', 'flushStageCache']);

interface RequestCall {
  service: string;
  method: string;
  params: unknown;
}

function createServerless(calls: RequestCall[]): ServerlessInstance {
  return {
    service: {
      service: 'test-service',
      getServiceName: () => 'test-service',
      custom: {
        interlaceCaching: {
          enabled: true,
          clusterSize: '0.5',
          ttlInSeconds: 300,
          restApiId: 'abc123def4',
        },
      },
      provider: {
        name: 'aws',
        stage: 'development',
        region: 'us-east-1',
        compiledCloudFormationTemplate: { Resources: {} },
      },
      functions: {
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
                  cacheKeyParameters: [
                    { name: 'request.path.id' },
                    { name: 'request.multivaluequerystring.tags' },
                  ],
                },
              },
            },
          ],
        },
      },
      getAllFunctions: () => ['getUser'],
      getFunction: (name: string) => ({
        name,
        handler: 'src/handler.get',
        events: [
          {
            http: {
              path: '/users/{id}',
              method: 'get',
              caching: {
                enabled: true,
                ttlInSeconds: 600,
              },
            },
          },
        ],
      }),
    },
    providers: {
      aws: {
        getStage: () => 'development',
        getRegion: () => 'us-east-1',
        getCredentials: () => ({}),
        request: vi.fn(
          async (service: string, method: string, params: unknown) => {
            calls.push({ service, method, params });
            if (method === 'getStage') {
              return {
                methodSettings: {
                  '*/*': { loggingLevel: 'INFO', metricsEnabled: true },
                },
              };
            }
            return {};
          },
        ),
      },
    },
    cli: { log: vi.fn() },
    configSchemaHandler: undefined,
  } as unknown as ServerlessInstance;
}

describe('caching:preview:show', () => {
  it('runs the preview without calling any AWS write APIs', async () => {
    const calls: RequestCall[] = [];
    const serverless = createServerless(calls);
    const plugin = new InterlaceCachingPlugin(serverless, {
      stage: 'development',
    });

    const previewHook = plugin.hooks['caching:preview:show'];
    expect(previewHook).toBeDefined();

    await previewHook!();

    const writeCalls = calls.filter((c) => WRITE_METHODS.has(c.method));
    expect(writeCalls).toEqual([]);

    // Read-only calls are acceptable. At minimum, getStage should be invoked
    // for CloudWatch settings inheritance.
    const readCalls = calls.filter((c) => READ_ONLY_METHODS.has(c.method));
    expect(readCalls.length).toBeGreaterThan(0);
  });

  it('logs a preview header with REST API ID, stage, and operation count', async () => {
    const calls: RequestCall[] = [];
    const serverless = createServerless(calls);
    const logSpy = serverless.cli.log as ReturnType<typeof vi.fn>;

    const plugin = new InterlaceCachingPlugin(serverless, {
      stage: 'development',
    });
    await plugin.hooks['caching:preview:show']!();

    const messages = logSpy.mock.calls.map((args) => String(args[0]));
    expect(messages.some((m) => m.includes('Cache Preview (dry-run)'))).toBe(
      true,
    );
    expect(messages.some((m) => m.includes('abc123def4'))).toBe(true);
    expect(messages.some((m) => m.includes('Operations:'))).toBe(true);
    expect(messages.some((m) => m.includes('Run `sls deploy` to apply'))).toBe(
      true,
    );
  });

  it('issues no write API calls even when cluster would be disabled', async () => {
    const calls: RequestCall[] = [];
    const serverless = createServerless(calls);
    // Override config to a disabled cluster — the deploy would issue a
    // `cacheClusterEnabled: false` patch op. The preview must show it without
    // calling AWS write APIs.
    (
      serverless.service.custom as {
        interlaceCaching: { enabled: boolean; restApiId: string };
      }
    ).interlaceCaching = {
      enabled: false,
      restApiId: 'abc123def4',
    };

    const plugin = new InterlaceCachingPlugin(serverless, {
      stage: 'development',
    });
    await plugin.hooks['caching:preview:show']!();

    expect(calls.filter((c) => WRITE_METHODS.has(c.method))).toEqual([]);
  });
});
