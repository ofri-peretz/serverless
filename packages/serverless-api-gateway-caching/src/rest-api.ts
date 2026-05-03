/**
 * @interlace/serverless-api-gateway-caching — REST API ID resolution
 *
 * Resolves the API Gateway REST API ID from the CloudFormation stack
 * or from explicit configuration.
 */

import type { AwsProvider } from './framework.js';

const REST_API_OUTPUT_KEY = 'InterlaceCachingRestApiId';

/**
 * Resolve the REST API ID. Priority:
 * 1. Explicit `restApiId` from config
 * 2. `provider.apiGateway.restApiId` from serverless config
 * 3. CloudFormation stack resource lookup
 * 4. CloudFormation stack output (for split-stacks)
 */
export async function resolveRestApiId(
  provider: AwsProvider,
  stackName: string,
  configRestApiId?: string,
  providerRestApiId?: string,
): Promise<string | undefined> {
  // 1. Explicit config
  if (configRestApiId) return configRestApiId;

  // 2. Provider config (shared API Gateway)
  if (providerRestApiId) return providerRestApiId;

  // 3. Stack resource
  const resourceId = await findStackResource(
    provider,
    stackName,
    'ApiGatewayRestApi',
  );
  if (resourceId) return resourceId;

  // 4. Stack output (split-stacks compatibility)
  return findStackOutput(provider, stackName, REST_API_OUTPUT_KEY);
}

/**
 * Add the REST API ID to CloudFormation outputs for split-stack compatibility.
 */
export function addRestApiIdOutput(compiledTemplate: {
  Outputs?: Record<string, unknown>;
}): void {
  if (!compiledTemplate.Outputs) {
    compiledTemplate.Outputs = {};
  }

  compiledTemplate.Outputs[REST_API_OUTPUT_KEY] = {
    Description: 'REST API ID for @interlace/serverless-api-gateway-caching',
    Value: { Ref: 'ApiGatewayRestApi' },
  };
}

/**
 * Check if a REST API exists in the CloudFormation template.
 */
export function restApiExistsInTemplate(compiledTemplate: {
  Resources: Record<string, { Type: string }>;
}): boolean {
  return Object.values(compiledTemplate.Resources).some(
    (resource) => resource.Type === 'AWS::ApiGateway::RestApi',
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function findStackResource(
  provider: AwsProvider,
  stackName: string,
  logicalId: string,
): Promise<string | undefined> {
  try {
    const response = await provider.request(
      'CloudFormation',
      'listStackResources',
      {
        StackName: stackName,
      },
    );
    const summaries = (response.StackResourceSummaries ?? []) as Array<{
      LogicalResourceId: string;
      PhysicalResourceId: string;
    }>;
    const match = summaries.find((s) => s.LogicalResourceId === logicalId);
    return match?.PhysicalResourceId;
  } catch {
    return undefined;
  }
}

async function findStackOutput(
  provider: AwsProvider,
  stackName: string,
  outputKey: string,
): Promise<string | undefined> {
  try {
    const response = await provider.request(
      'CloudFormation',
      'describeStacks',
      {
        StackName: stackName,
      },
    );
    const stacks = (response.Stacks ?? []) as Array<{
      Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
    }>;
    if (stacks.length === 0) return undefined;
    const match = stacks[0].Outputs?.find((o) => o.OutputKey === outputKey);
    return match?.OutputValue;
  } catch {
    return undefined;
  }
}
