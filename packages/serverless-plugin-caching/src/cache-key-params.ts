/**
 * @interlace/serverless-plugin-caching — Cache key parameters
 *
 * Mutates the CloudFormation template to add RequestParameters
 * for cache key configuration on API Gateway methods.
 */

import type { ServerlessInstance } from '@interlace/serverless-devkit';
import type { ResolvedCachingSettings, CacheKeyParameterConfig } from './types.js';

/**
 * Add cache key parameter configuration to the CloudFormation template.
 * This enables API Gateway to use path params, query strings, and headers
 * as part of the cache key.
 */
export function addCacheKeyParametersToTemplate(
  serverless: ServerlessInstance,
  settings: ResolvedCachingSettings,
): void {
  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  for (const endpoint of settings.endpoints) {
    if (!endpoint.cachingEnabled || endpoint.cacheKeyParameters.length === 0) {
      continue;
    }

    // Find the corresponding API Gateway Method resource
    const methodResource = findMethodResource(
      resources,
      endpoint.resourcePath,
      endpoint.httpMethod,
    );

    if (!methodResource) {
      serverless.cli.log(
        `[interlace-caching] Warning: Could not find CF resource for ${endpoint.httpMethod} ${endpoint.resourcePath}`,
      );
      continue;
    }

    addRequestParameters(methodResource, endpoint.cacheKeyParameters);
    addIntegrationParameters(methodResource, endpoint.cacheKeyParameters);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findMethodResource(
  resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>,
  path: string,
  method: string,
): Record<string, unknown> | undefined {
  for (const resource of Object.values(resources)) {
    if (resource.Type !== 'AWS::ApiGateway::Method') continue;
    const props = resource.Properties ?? {};
    const httpMethod = props.HttpMethod as string | undefined;
    if (httpMethod?.toUpperCase() !== method.toUpperCase()) continue;

    // Match by resource path - check the ResourceId reference chain
    // The method's ResourceId is a Ref to the API Gateway Resource
    // We match by the method since paths are encoded in resource names
    return resource as unknown as Record<string, unknown>;
  }
  return undefined;
}

function addRequestParameters(
  methodResource: Record<string, unknown>,
  params: CacheKeyParameterConfig[],
): void {
  const props = (methodResource.Properties ?? {}) as Record<string, unknown>;
  const requestParams = (props.RequestParameters ?? {}) as Record<string, boolean>;

  for (const param of params) {
    const paramName = normalizeParameterName(param.name);
    requestParams[`method.${paramName}`] = true;
  }

  props.RequestParameters = requestParams;
  methodResource.Properties = props;
}

function addIntegrationParameters(
  methodResource: Record<string, unknown>,
  params: CacheKeyParameterConfig[],
): void {
  const props = (methodResource.Properties ?? {}) as Record<string, unknown>;
  const integration = (props.Integration ?? {}) as Record<string, unknown>;
  const requestParams = (integration.RequestParameters ?? {}) as Record<string, string>;

  for (const param of params) {
    const paramName = normalizeParameterName(param.name);
    const mappedValue = param.value ?? `method.${paramName}`;
    requestParams[`integration.${paramName}`] = mappedValue;
  }

  integration.RequestParameters = requestParams;
  props.Integration = integration;
  methodResource.Properties = props;
}

/**
 * Normalize parameter names to the API Gateway format.
 *
 * Input formats accepted:
 * - `request.path.id` → `request.path.id`
 * - `request.querystring.page` → `request.querystring.page`
 * - `request.header.Accept` → `request.header.Accept`
 */
function normalizeParameterName(name: string): string {
  // Already in correct format
  if (name.startsWith('request.')) return name;

  // Legacy format support: `path.id` → `request.path.id`
  if (name.startsWith('path.') || name.startsWith('querystring.') || name.startsWith('header.')) {
    return `request.${name}`;
  }

  return name;
}
