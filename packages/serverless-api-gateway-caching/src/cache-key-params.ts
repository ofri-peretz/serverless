/**
 * @interlace/serverless-api-gateway-caching — Cache key parameters
 *
 * Mutates the CloudFormation template to add:
 * - RequestParameters (method-level)
 * - Integration.RequestParameters (integration-level)
 * - Integration.CacheKeyParameters (cache key list)
 * - Integration.CacheNamespace (per-method cache isolation)
 *
 * Supports path, querystring, header, and body-based cache keys.
 */

import type { ServerlessInstance } from '@interlace/serverless-devkit';
import type { ResolvedCachingSettings, EndpointSettings, CacheKeyParameterConfig } from './types.js';

/**
 * Add cache key parameter configuration to the CloudFormation template.
 */
export function addCacheKeyParametersToTemplate(
  serverless: ServerlessInstance,
  settings: ResolvedCachingSettings,
): void {
  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  // Process function endpoints
  for (const endpoint of settings.endpoints) {
    if (!endpoint.cachingEnabled || endpoint.cacheKeyParameters.length === 0) {
      continue;
    }
    applyToResource(resources, endpoint, serverless);
  }

  // Process additional (CF-defined) endpoints
  for (const endpoint of settings.additionalEndpoints) {
    if (!endpoint.cachingEnabled || endpoint.cacheKeyParameters.length === 0) {
      continue;
    }
    applyToResource(resources, endpoint, serverless);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyToResource(
  resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>,
  endpoint: EndpointSettings,
  serverless: ServerlessInstance,
): void {
  const methodResource = resources[endpoint.gatewayResourceName];

  if (!methodResource || methodResource.Type !== 'AWS::ApiGateway::Method') {
    serverless.cli.log(
      `[interlace-caching] Warning: Could not find CF resource '${endpoint.gatewayResourceName}' ` +
      `for ${endpoint.httpMethod} ${endpoint.resourcePath}. Cache key parameters will not be applied.`,
    );
    return;
  }

  const props = (methodResource.Properties ?? {}) as Record<string, unknown>;
  const integration = (props.Integration ?? {}) as Record<string, unknown>;
  const integrationType = integration.Type as string | undefined;

  // Initialize arrays/objects if missing
  if (!integration.CacheKeyParameters) {
    integration.CacheKeyParameters = [];
  }
  if (!integration.RequestParameters) {
    integration.RequestParameters = {};
  }
  if (!props.RequestParameters) {
    props.RequestParameters = {};
  }

  const methodRequestParams = props.RequestParameters as Record<string, boolean>;
  const integrationRequestParams = integration.RequestParameters as Record<string, string>;
  const cacheKeyParams = integration.CacheKeyParameters as string[];

  for (const param of endpoint.cacheKeyParameters) {
    if (param.mappedFrom) {
      // Body-based or custom mapping:
      //   name: 'integration.request.header.bodyValue'
      //   mappedFrom: 'method.request.body'
      applyMappedParam(
        param,
        methodRequestParams,
        integrationRequestParams,
        cacheKeyParams,
      );
    } else {
      // Standard path/querystring/header cache key
      applyStandardParam(
        param,
        methodRequestParams,
        integrationRequestParams,
        cacheKeyParams,
        integrationType,
      );
    }
  }

  // Set CacheNamespace for per-method cache isolation
  integration.CacheNamespace = `${endpoint.gatewayResourceName}CacheNS`;

  props.Integration = integration;
  props.RequestParameters = methodRequestParams;
  methodResource.Properties = props;
}

/**
 * Apply a standard cache key parameter (path, querystring, or header).
 *
 * For standard params like `request.path.id`:
 * - Adds `method.request.path.id: true` to RequestParameters
 * - Adds `integration.request.path.id: method.request.path.id` to Integration.RequestParameters
 *   (skipped for AWS_PROXY to avoid 500 errors)
 * - Adds `method.request.path.id` to Integration.CacheKeyParameters
 */
function applyStandardParam(
  param: CacheKeyParameterConfig,
  methodRequestParams: Record<string, boolean>,
  integrationRequestParams: Record<string, string>,
  cacheKeyParams: string[],
  integrationType?: string,
): void {
  const paramName = normalizeParameterName(param.name);
  const methodParam = `method.${paramName}`;

  // Preserve existing required/optional value if already set
  const existingValue = methodRequestParams[methodParam];
  methodRequestParams[methodParam] = existingValue ?? false;

  // Don't set integration params for AWS_PROXY — causes 500 errors
  // (discovered by community plugin in v1.x, then partially reverted in v1.8.0)
  if (integrationType !== 'AWS_PROXY') {
    integrationRequestParams[`integration.${paramName}`] = methodParam;
  }

  cacheKeyParams.push(methodParam);
}

/**
 * Apply a mapped cache key parameter (body or custom mapping).
 *
 * For body-based params:
 *   name: 'integration.request.header.bodyValue'
 *   mappedFrom: 'method.request.body'
 *
 * Sets up:
 * - methodRequestParams: mappedFrom → false (if applicable)
 * - integrationRequestParams: name → mappedFrom
 * - CacheKeyParameters: name
 */
function applyMappedParam(
  param: CacheKeyParameterConfig,
  methodRequestParams: Record<string, boolean>,
  integrationRequestParams: Record<string, string>,
  cacheKeyParams: string[],
): void {
  const mappedFrom = param.mappedFrom!;

  // Add method.request.* params to RequestParameters (not body — body doesn't go here)
  if (
    mappedFrom.includes('method.request.querystring') ||
    mappedFrom.includes('method.request.header') ||
    mappedFrom.includes('method.request.path')
  ) {
    const existingValue = methodRequestParams[mappedFrom];
    methodRequestParams[mappedFrom] = existingValue ?? false;
  }

  integrationRequestParams[param.name] = mappedFrom;
  cacheKeyParams.push(param.name);
}

/**
 * Normalize parameter names to the API Gateway format.
 *
 * Accepted inputs:
 * - `request.path.id` → `request.path.id`
 * - `request.querystring.page` → `request.querystring.page`
 * - `request.header.Accept` → `request.header.Accept`
 * - `path.id` → `request.path.id` (legacy shorthand)
 */
function normalizeParameterName(name: string): string {
  if (name.startsWith('request.')) return name;

  // Legacy format support
  if (name.startsWith('path.') || name.startsWith('querystring.') || name.startsWith('header.')) {
    return `request.${name}`;
  }

  return name;
}
