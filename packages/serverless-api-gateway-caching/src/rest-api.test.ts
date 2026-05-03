import { describe, it, expect, vi } from 'vitest';
import type { AwsProvider } from './framework.js';
import {
  resolveRestApiId,
  addRestApiIdOutput,
  restApiExistsInTemplate,
} from './rest-api.js';

function makeProvider(
  responses: Partial<Record<string, unknown>> = {},
): AwsProvider {
  return {
    getStage: () => 'development',
    getRegion: () => 'us-east-1',
    request: vi.fn(async (_service: string, method: string) => {
      if (method in responses) {
        const value = responses[method];
        if (value instanceof Error) throw value;
        return value as Record<string, unknown>;
      }
      return {};
    }),
  } as unknown as AwsProvider;
}

describe('resolveRestApiId', () => {
  it('returns explicit configRestApiId when provided (priority 1)', async () => {
    const provider = makeProvider();
    const id = await resolveRestApiId(
      provider,
      'my-stack-dev',
      'explicit-id',
      'provider-id',
    );
    expect(id).toBe('explicit-id');
    expect(
      (provider.request as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });

  it('falls back to providerRestApiId when configRestApiId is undefined (priority 2)', async () => {
    const provider = makeProvider();
    const id = await resolveRestApiId(
      provider,
      'my-stack-dev',
      undefined,
      'shared-api',
    );
    expect(id).toBe('shared-api');
    expect(
      (provider.request as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });

  it('falls back to listStackResources lookup (priority 3)', async () => {
    const provider = makeProvider({
      listStackResources: {
        StackResourceSummaries: [
          { LogicalResourceId: 'OtherResource', PhysicalResourceId: 'other' },
          {
            LogicalResourceId: 'ApiGatewayRestApi',
            PhysicalResourceId: 'api-from-stack',
          },
        ],
      },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBe('api-from-stack');
  });

  it('falls back to describeStacks output (priority 4) when stack resource not found', async () => {
    const provider = makeProvider({
      listStackResources: { StackResourceSummaries: [] },
      describeStacks: {
        Stacks: [
          {
            Outputs: [
              { OutputKey: 'OtherOutput', OutputValue: 'noise' },
              {
                OutputKey: 'InterlaceCachingRestApiId',
                OutputValue: 'api-from-output',
              },
            ],
          },
        ],
      },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBe('api-from-output');
  });

  it('returns undefined when nothing matches anywhere', async () => {
    const provider = makeProvider({
      listStackResources: { StackResourceSummaries: [] },
      describeStacks: { Stacks: [] },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBeUndefined();
  });

  it('returns undefined when describeStacks output key is missing', async () => {
    const provider = makeProvider({
      listStackResources: { StackResourceSummaries: [] },
      describeStacks: {
        Stacks: [
          { Outputs: [{ OutputKey: 'Different', OutputValue: 'noise' }] },
        ],
      },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBeUndefined();
  });

  it('returns undefined when describeStacks output array is missing', async () => {
    const provider = makeProvider({
      listStackResources: { StackResourceSummaries: [] },
      describeStacks: { Stacks: [{}] },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBeUndefined();
  });

  it('swallows listStackResources errors and falls through to output lookup', async () => {
    const provider = makeProvider({
      listStackResources: new Error('access denied'),
      describeStacks: {
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'InterlaceCachingRestApiId',
                OutputValue: 'api-from-output',
              },
            ],
          },
        ],
      },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBe('api-from-output');
  });

  it('swallows describeStacks errors and returns undefined', async () => {
    const provider = makeProvider({
      listStackResources: new Error('access denied'),
      describeStacks: new Error('stack does not exist'),
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBeUndefined();
  });

  it('handles missing StackResourceSummaries field gracefully', async () => {
    const provider = makeProvider({
      listStackResources: {},
      describeStacks: { Stacks: [] },
    });
    const id = await resolveRestApiId(provider, 'my-stack-dev');
    expect(id).toBeUndefined();
  });
});

describe('addRestApiIdOutput', () => {
  it('initializes Outputs when missing', () => {
    const template: { Outputs?: Record<string, unknown> } = {};
    addRestApiIdOutput(template);
    expect(template.Outputs).toBeDefined();
    expect(template.Outputs!.InterlaceCachingRestApiId).toEqual({
      Description: 'REST API ID for @interlace/serverless-api-gateway-caching',
      Value: { Ref: 'ApiGatewayRestApi' },
    });
  });

  it('preserves existing Outputs and adds the REST API ID output', () => {
    const template: { Outputs?: Record<string, unknown> } = {
      Outputs: { ExistingOutput: { Value: 'keep-me' } },
    };
    addRestApiIdOutput(template);
    expect(template.Outputs!.ExistingOutput).toEqual({ Value: 'keep-me' });
    expect(template.Outputs!.InterlaceCachingRestApiId).toBeDefined();
  });

  it('overwrites a pre-existing entry under the same output key (idempotent)', () => {
    const template: { Outputs?: Record<string, unknown> } = {
      Outputs: { InterlaceCachingRestApiId: { Value: 'stale' } },
    };
    addRestApiIdOutput(template);
    expect(
      (template.Outputs!.InterlaceCachingRestApiId as { Value: unknown }).Value,
    ).toEqual({
      Ref: 'ApiGatewayRestApi',
    });
  });
});

describe('restApiExistsInTemplate', () => {
  it('returns true when an AWS::ApiGateway::RestApi resource is present', () => {
    const template = {
      Resources: {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        SomeFn: { Type: 'AWS::Lambda::Function' },
      },
    };
    expect(restApiExistsInTemplate(template)).toBe(true);
  });

  it('returns false when no API Gateway REST API is in the template', () => {
    const template = {
      Resources: {
        SomeFn: { Type: 'AWS::Lambda::Function' },
        SomeRole: { Type: 'AWS::IAM::Role' },
      },
    };
    expect(restApiExistsInTemplate(template)).toBe(false);
  });

  it('returns false for empty Resources', () => {
    expect(restApiExistsInTemplate({ Resources: {} })).toBe(false);
  });
});
