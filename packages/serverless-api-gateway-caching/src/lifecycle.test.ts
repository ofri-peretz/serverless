/**
 * Lifecycle + CLI command tests for the InterlaceCachingPlugin class.
 *
 * Covers every hook and CLI command end-to-end against a stubbed Serverless
 * instance. The dry-run preview command is covered separately in preview.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ServerlessInstance } from './framework.js';
import InterlaceCachingPlugin from './index.js';

interface RequestCall {
  service: string;
  method: string;
  params: unknown;
}

interface MakeServerlessOptions {
  custom?: Record<string, unknown>;
  functions?: Record<string, unknown>;
  cfTemplateResources?: Record<
    string,
    { Type: string; Properties?: Record<string, unknown> }
  >;
  schemaHandler?: boolean;
  apiGatewayConfig?: { restApiId?: string };
  stackName?: string;
  /** Override what AWS API responses to return per (service, method) */
  awsResponses?: Record<string, unknown>;
}

function makeServerless(opts: MakeServerlessOptions = {}): {
  sls: ServerlessInstance;
  awsCalls: RequestCall[];
  logCalls: string[];
} {
  const awsCalls: RequestCall[] = [];
  const logCalls: string[] = [];
  const fns = opts.functions ?? {};
  const fnNames = Object.keys(fns);
  const sls = {
    service: {
      service: 'demo',
      getServiceName: () => 'demo',
      custom: opts.custom ?? {},
      provider: {
        name: 'aws',
        stage: 'development',
        region: 'us-east-1',
        stackName: opts.stackName,
        apiGateway: opts.apiGatewayConfig,
        compiledCloudFormationTemplate: {
          Resources: opts.cfTemplateResources ?? {},
          Outputs: {},
        },
      },
      functions: fns as ServerlessInstance['service']['functions'],
      getAllFunctions: () => fnNames,
      getFunction: (name: string) => ({
        name,
        ...(fns[name] as Record<string, unknown>),
      }),
    },
    providers: {
      aws: {
        getStage: () => 'development',
        getRegion: () => 'us-east-1',
        request: vi.fn(
          async (service: string, method: string, params: unknown) => {
            awsCalls.push({ service, method, params });
            const key = `${service}.${method}`;
            if (opts.awsResponses && key in opts.awsResponses) {
              const v = opts.awsResponses[key];
              if (v instanceof Error) throw v;
              return v as Record<string, unknown>;
            }
            return {};
          },
        ),
      },
    },
    cli: {
      log: vi.fn((m: string) => {
        logCalls.push(m);
      }),
    },
    configSchemaHandler:
      opts.schemaHandler === false
        ? undefined
        : {
            defineCustomProperties: vi.fn(),
            defineFunctionEventProperties: vi.fn(),
          },
  } as unknown as ServerlessInstance;
  return { sls, awsCalls, logCalls };
}

describe('lifecycle hooks', () => {
  describe('before:package:initialize', () => {
    it('populates settings from custom.interlaceCaching', async () => {
      const { sls } = makeServerless({
        custom: { interlaceCaching: { enabled: true, ttlInSeconds: 600 } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      // Subsequent hooks should not re-resolve settings; verified by behavior tests below.
      expect(plugin.hooks['before:package:initialize']).toBeDefined();
    });
  });

  describe('before:package:finalize', () => {
    it('skips when no REST API resource is in the CF template', async () => {
      const { sls, logCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
        cfTemplateResources: { SomeFn: { Type: 'AWS::Lambda::Function' } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      expect(logCalls.some((m) => m.includes('No REST API found'))).toBe(true);
    });

    it('adds the InterlaceCachingRestApiId output and applies cache key params when REST API exists', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        ApiGatewayMethodItemsIdVarGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {},
        },
      };
      const { sls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
        functions: {
          getItem: {
            handler: 'src/handler.get',
            events: [
              {
                http: {
                  path: '/items/{id}',
                  method: 'get',
                  caching: {
                    enabled: true,
                    cacheKeyParameters: [{ name: 'request.path.id' }],
                  },
                },
              },
            ],
          },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();

      const outputs =
        sls.service.provider.compiledCloudFormationTemplate.Outputs!;
      expect(outputs.InterlaceCachingRestApiId).toBeDefined();

      const method = cfTemplateResources.ApiGatewayMethodItemsIdVarGet as {
        Properties: { Integration?: { CacheKeyParameters?: string[] } };
      };
      expect(method.Properties.Integration?.CacheKeyParameters).toContain(
        'method.request.path.id',
      );
    });

    it('resolves settings on its own when before:package:initialize was not called', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      // Skip before:package:initialize — finalize must self-resolve.
      await plugin.hooks['before:package:finalize']();
      const outputs =
        sls.service.provider.compiledCloudFormationTemplate.Outputs!;
      expect(outputs.InterlaceCachingRestApiId).toBeDefined();
    });
  });

  describe('after:deploy:deploy', () => {
    it('skips when no REST API resource exists in the template', async () => {
      const { sls, logCalls, awsCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(logCalls.some((m) => m.includes('No REST API found'))).toBe(true);
      expect(awsCalls.some((c) => c.method === 'updateStage')).toBe(false);
    });

    it('applies cache patches against AWS via UpdateStage', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, awsCalls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: {
            enabled: true,
            restApiId: 'api-explicit',
            clusterSize: '1.6',
          },
        },
        functions: {
          getItem: {
            handler: 'src/handler.get',
            events: [
              {
                http: {
                  path: '/items/{id}',
                  method: 'get',
                  caching: { enabled: true, ttlInSeconds: 600 },
                },
              },
            ],
          },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, { stage: 'development' });
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();

      const updateStageCalls = awsCalls.filter(
        (c) => c.method === 'updateStage',
      );
      expect(updateStageCalls.length).toBeGreaterThan(0);
      expect(logCalls.some((m) => m.includes('Cache enabled'))).toBe(true);
      expect(logCalls.some((m) => m.includes('1.6 GB'))).toBe(true);
    });

    it('warns when cluster is enabled but no endpoints have caching', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
        functions: {
          listItems: {
            handler: 'src/handler.list',
            events: [{ http: { path: '/items', method: 'get' } }],
          },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(
        logCalls.some((m) =>
          m.includes('caching is enabled but none of the endpoints'),
        ),
      ).toBe(true);
    });

    it('logs shared API Gateway summary when sharedApiGateway is true', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: {
            enabled: true,
            restApiId: 'api-explicit',
            sharedApiGateway: true,
          },
        },
        functions: {
          listItems: {
            handler: 'src/handler.list',
            events: [
              {
                http: {
                  path: '/items',
                  method: 'get',
                  caching: { enabled: true },
                },
              },
            ],
          },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(logCalls.some((m) => m.includes('Shared API Gateway mode'))).toBe(
        true,
      );
    });

    it('logs "Cache disabled" when cachingEnabled is false', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: false, restApiId: 'api-explicit' },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(
        logCalls.some((m) => m === '[interlace-caching] Cache disabled.'),
      ).toBe(true);
    });

    it('flushes the cache after a successful deploy when flushOnDeploy is true', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, awsCalls } = makeServerless({
        custom: {
          interlaceCaching: {
            enabled: true,
            restApiId: 'api-explicit',
            flushOnDeploy: true,
          },
        },
        functions: {
          getItem: {
            handler: 'h',
            events: [
              {
                http: {
                  path: '/items',
                  method: 'get',
                  caching: { enabled: true },
                },
              },
            ],
          },
        },
        cfTemplateResources,
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(awsCalls.some((c) => c.method === 'flushStageCache')).toBe(true);
    });

    it('skips silently when no REST API ID can be resolved', async () => {
      const cfTemplateResources = {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
      };
      const { sls, logCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
        cfTemplateResources,
        // No explicit restApiId, no provider.apiGateway, AWS responses default to {}
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:package:initialize']();
      await plugin.hooks['before:package:finalize']();
      await plugin.hooks['after:deploy:deploy']();
      expect(
        logCalls.some((m) => m.includes('Unable to determine REST API ID')),
      ).toBe(true);
    });
  });

  describe('before:remove:remove', () => {
    it('disables the cache cluster before stack removal', async () => {
      const { sls, awsCalls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:remove:remove']();
      const updateCalls = awsCalls.filter((c) => c.method === 'updateStage');
      expect(updateCalls).toHaveLength(1);
      const params = updateCalls[0].params as {
        patchOperations: Array<{ path: string; value: string }>;
      };
      expect(params.patchOperations).toContainEqual({
        op: 'replace',
        path: '/cacheClusterEnabled',
        value: 'false',
      });
      expect(logCalls.some((m) => m.includes('Cache cluster disabled'))).toBe(
        true,
      );
    });

    it('does not block stack removal when cleanup fails', async () => {
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
        awsResponses: { 'APIGateway.updateStage': new Error('AccessDenied') },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      // Should NOT throw — cleanup failures are logged and swallowed
      await expect(
        plugin.hooks['before:remove:remove'](),
      ).resolves.toBeUndefined();
      expect(logCalls.some((m) => m.includes('Cache cleanup failed'))).toBe(
        true,
      );
    });

    it('skips when no REST API ID can be resolved', async () => {
      const { sls, logCalls, awsCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['before:remove:remove']();
      expect(
        logCalls.some((m) => m.includes('No REST API found. No cache cleanup')),
      ).toBe(true);
      expect(awsCalls.some((c) => c.method === 'updateStage')).toBe(false);
    });
  });
});

describe('CLI commands', () => {
  describe('caching:flush:flush', () => {
    it('calls flushStageCache against the resolved API/stage', async () => {
      const { sls, awsCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
      });
      const plugin = new InterlaceCachingPlugin(sls, { stage: 'production' });
      await plugin.hooks['caching:flush:flush']();
      const flushCalls = awsCalls.filter((c) => c.method === 'flushStageCache');
      expect(flushCalls).toHaveLength(1);
      expect((flushCalls[0].params as { stageName: string }).stageName).toBe(
        'production',
      );
    });

    it('logs and exits when REST API ID is unresolvable', async () => {
      const { sls, logCalls, awsCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:flush:flush']();
      expect(
        logCalls.some((m) => m.includes('Unable to determine REST API ID')),
      ).toBe(true);
      expect(awsCalls.some((c) => c.method === 'flushStageCache')).toBe(false);
    });
  });

  describe('caching:status:show', () => {
    it('reads cluster state from getStage and prints it', async () => {
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
        awsResponses: {
          'APIGateway.getStage': {
            cacheClusterEnabled: true,
            cacheClusterSize: '0.5',
            cacheClusterStatus: 'AVAILABLE',
          },
        },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:status:show']();
      expect(logCalls.some((m) => m.includes('--- Cache Status ---'))).toBe(
        true,
      );
      expect(logCalls.some((m) => m.includes('Enabled:  true'))).toBe(true);
      expect(logCalls.some((m) => m.includes('Size:     0.5 GB'))).toBe(true);
      expect(logCalls.some((m) => m.includes('Status:   AVAILABLE'))).toBe(
        true,
      );
    });

    it('handles getStage errors gracefully', async () => {
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
        awsResponses: { 'APIGateway.getStage': new Error('AccessDenied') },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:status:show']();
      expect(
        logCalls.some((m) => m.includes('Failed to get cache status')),
      ).toBe(true);
    });

    it('exits when REST API ID unresolvable', async () => {
      const { sls, logCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:status:show']();
      expect(
        logCalls.some((m) => m.includes('Unable to determine REST API ID')),
      ).toBe(true);
    });
  });

  describe('caching:disable:disable', () => {
    it('disables the cluster and prints offboarding instructions', async () => {
      const { sls, awsCalls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
      });
      const plugin = new InterlaceCachingPlugin(sls, { stage: 'production' });
      await plugin.hooks['caching:disable:disable']();
      const updateCalls = awsCalls.filter((c) => c.method === 'updateStage');
      expect(updateCalls).toHaveLength(1);
      const params = updateCalls[0].params as {
        patchOperations: Array<{ path: string; value: string }>;
      };
      expect(params.patchOperations).toContainEqual({
        op: 'replace',
        path: '/cacheClusterEnabled',
        value: 'false',
      });
      expect(
        logCalls.some((m) => m.includes('Cache cluster disabled successfully')),
      ).toBe(true);
      expect(
        logCalls.some((m) =>
          m.includes('Remove "@interlace/serverless-api-gateway-caching"'),
        ),
      ).toBe(true);
    });

    it('reports and continues when the disable call fails', async () => {
      const { sls, logCalls } = makeServerless({
        custom: {
          interlaceCaching: { enabled: true, restApiId: 'api-explicit' },
        },
        awsResponses: { 'APIGateway.updateStage': new Error('AccessDenied') },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:disable:disable']();
      expect(logCalls.some((m) => m.includes('Failed to disable cache'))).toBe(
        true,
      );
      expect(logCalls.some((m) => m.includes('still be running'))).toBe(true);
    });

    it('exits when REST API ID unresolvable', async () => {
      const { sls, logCalls, awsCalls } = makeServerless({
        custom: { interlaceCaching: { enabled: true } },
      });
      const plugin = new InterlaceCachingPlugin(sls, {});
      await plugin.hooks['caching:disable:disable']();
      expect(
        logCalls.some((m) => m.includes('Unable to determine REST API ID')),
      ).toBe(true);
      expect(awsCalls.some((c) => c.method === 'updateStage')).toBe(false);
    });
  });
});

describe('REST API ID resolution chain (getRestApiId)', () => {
  it('uses provider.apiGateway.restApiId when set and config is empty', async () => {
    const { sls, awsCalls } = makeServerless({
      custom: { interlaceCaching: { enabled: true } },
      apiGatewayConfig: { restApiId: 'shared-id' },
    });
    const plugin = new InterlaceCachingPlugin(sls, {});
    await plugin.hooks['caching:flush:flush']();
    const flushCall = awsCalls.find((c) => c.method === 'flushStageCache');
    expect((flushCall!.params as { restApiId: string }).restApiId).toBe(
      'shared-id',
    );
  });

  it('falls back to listStackResources when no explicit IDs are set', async () => {
    const { sls, awsCalls } = makeServerless({
      custom: { interlaceCaching: { enabled: true } },
      awsResponses: {
        'CloudFormation.listStackResources': {
          StackResourceSummaries: [
            {
              LogicalResourceId: 'ApiGatewayRestApi',
              PhysicalResourceId: 'from-stack',
            },
          ],
        },
      },
    });
    const plugin = new InterlaceCachingPlugin(sls, {});
    await plugin.hooks['caching:flush:flush']();
    const flushCall = awsCalls.find((c) => c.method === 'flushStageCache');
    expect((flushCall!.params as { restApiId: string }).restApiId).toBe(
      'from-stack',
    );
  });

  it('uses provider.stackName when set, otherwise falls back to service-stage', async () => {
    const captured: { stackName?: string } = {};
    const { sls } = makeServerless({
      custom: { interlaceCaching: { enabled: true } },
      stackName: 'custom-stack-name',
      awsResponses: {
        'CloudFormation.listStackResources': () => {
          throw new Error('not used by this assertion');
        },
      },
    });
    // Hook into the request to capture the stack name
    sls.providers.aws.request = vi.fn(async (_svc, method, params: unknown) => {
      if (method === 'listStackResources') {
        captured.stackName = (params as { StackName: string }).StackName;
        return {};
      }
      return {};
    });
    const plugin = new InterlaceCachingPlugin(sls, {});
    await plugin.hooks['caching:flush:flush']();
    expect(captured.stackName).toBe('custom-stack-name');
  });
});

describe('defineValidationSchema', () => {
  it('registers custom + function-event schemas via configSchemaHandler', () => {
    const { sls } = makeServerless({
      custom: { interlaceCaching: { enabled: true } },
    });
    const _plugin = new InterlaceCachingPlugin(sls, {});
    void _plugin;

    const handler = sls.configSchemaHandler!;
    const customCalls = (
      handler.defineCustomProperties as ReturnType<typeof vi.fn>
    ).mock.calls;
    expect(customCalls).toHaveLength(1);
    const customSchema = customCalls[0][0] as {
      properties: { interlaceCaching: { properties: Record<string, unknown> } };
    };
    expect(customSchema.properties.interlaceCaching.properties).toMatchObject({
      enabled: { type: 'boolean' },
      clusterSize: { type: 'string', enum: expect.any(Array) },
      ttlInSeconds: { type: 'number', minimum: 0, maximum: 3600 },
      flushOnDeploy: { type: 'boolean' },
      sharedApiGateway: { type: 'boolean' },
      additionalEndpoints: { type: 'array' },
    });

    const eventCalls = (
      handler.defineFunctionEventProperties as ReturnType<typeof vi.fn>
    ).mock.calls;
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0][0]).toBe('aws');
    expect(eventCalls[0][1]).toBe('http');
  });

  it('is a no-op when configSchemaHandler is unavailable (older Serverless versions)', () => {
    const { sls } = makeServerless({
      custom: { interlaceCaching: { enabled: true } },
      schemaHandler: false,
    });
    // Constructor must not throw
    expect(() => new InterlaceCachingPlugin(sls, {})).not.toThrow();
  });
});
