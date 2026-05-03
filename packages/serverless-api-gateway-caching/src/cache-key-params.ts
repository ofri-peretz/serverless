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

import type { ServerlessInstance } from './framework.js';
import type {
  ResolvedCachingSettings,
  EndpointSettings,
  CacheKeyParameterConfig,
} from './types.js';

/**
 * Add cache key parameter configuration to the CloudFormation template.
 */
export function addCacheKeyParametersToTemplate(
  serverless: ServerlessInstance,
  settings: ResolvedCachingSettings,
): void {
  const resources =
    serverless.service.provider.compiledCloudFormationTemplate.Resources;

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
  resources: Record<
    string,
    { Type: string; Properties?: Record<string, unknown> }
  >,
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

  const methodRequestParams = props.RequestParameters as Record<
    string,
    boolean
  >;
  const integrationRequestParams = integration.RequestParameters as Record<
    string,
    string
  >;
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
  // Caller (`applyToResource`) only invokes this branch when `param.mappedFrom`
  // is defined, so a runtime fallback isn't strictly required — but use a
  // narrowing guard rather than a non-null assertion to satisfy strict lint
  // and avoid silent breakage if a caller pathway changes.
  const mappedFrom = param.mappedFrom;
  if (!mappedFrom) return;

  // Only register `method.request.*` keys for the locations AWS API Gateway accepts
  // in `RequestParameters` maps: `path`, `querystring`, `header`.
  // Multi-value sources (`multivaluequerystring`, `multivalueheader`) are NOT valid
  // here — AWS rejects them as "Invalid mapping expression". They're accessible only
  // from VTL mapping templates, not as cache key parameter declarations.
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

const LEGACY_PREFIXES = ['path.', 'querystring.', 'header.'];

/**
 * Normalize parameter names to the API Gateway format.
 *
 * Accepted inputs (canonical):
 * - `request.path.<name>`
 * - `request.querystring.<name>`
 * - `request.header.<name>`
 *
 * Legacy shorthand (auto-prefixed with `request.`):
 * - `path.<name>`, `querystring.<name>`, `header.<name>`
 *
 * **Multi-value query strings and headers are NOT supported** as cache key
 * parameters — this is an AWS API Gateway limitation, not a plugin choice.
 * AWS rejects `method.request.multivaluequerystring.<name>` and
 * `method.request.multivalueheader.<name>` with "Invalid mapping expression".
 * The community `serverless-api-gateway-caching` plugin notes the same limitation.
 */
function normalizeParameterName(name: string): string {
  if (name.startsWith('request.')) return name;

  if (LEGACY_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return `request.${name}`;
  }

  return name;
}
