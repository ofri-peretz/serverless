/**
 * @interlace/serverless-plugin-caching
 *
 * API Gateway caching plugin for Serverless Framework.
 * Replaces `serverless-api-gateway-caching` with:
 * - Proper cleanup hooks (before:remove:remove)
 * - Cache flush/status commands
 * - ANY method → GET-only caching
 * - CloudWatch settings inheritance
 * - Shared API Gateway support
 * - Additional (CF-defined) endpoints
 * - Body-based cache keys (mappedFrom)
 * - CacheKeyParameters + CacheNamespace on CF template
 * - Jittered exponential backoff (no thundering herd)
 * - Zero prototype pollution, zero dependencies
 * - TypeScript-native, full config validation
 *
 * @example
 * ```yaml
 * # serverless.yml
 * plugins:
 *   - '@interlace/serverless-plugin-caching'
 *
 * custom:
 *   interlaceCaching:
 *     enabled: true
 *     clusterSize: '0.5'
 *     ttlInSeconds: 300
 *     flushOnDeploy: true
 * ```
 */

import type {
  ServerlessInstance,
  ServerlessOptions,
  ServerlessPlugin,
  ServerlessHooks,
  ServerlessCommands,
  AwsProvider,
} from '@interlace/serverless-devkit';
import type { ResolvedCachingSettings } from './types.js';
import { resolveSettings } from './settings.js';
import { addCacheKeyParametersToTemplate } from './cache-key-params.js';
import {
  resolveRestApiId,
  addRestApiIdOutput,
  restApiExistsInTemplate,
} from './rest-api.js';
import {
  buildPatchOperations,
  updateStageCache,
  flushStageCache,
  getStageState,
} from './stage-cache.js';

class InterlaceCachingPlugin implements ServerlessPlugin {
  public hooks: ServerlessHooks;
  public commands: ServerlessCommands;

  private serverless: ServerlessInstance;
  private options: ServerlessOptions;
  private provider: AwsProvider;
  private settings: ResolvedCachingSettings | undefined;
  private hasRestApi = false;

  constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
    this.serverless = serverless;
    this.options = options;
    this.provider = serverless.providers.aws;

    this.commands = {
      caching: {
        usage: 'Manage API Gateway cache settings',
        commands: {
          flush: {
            usage: 'Flush the API Gateway stage cache',
            lifecycleEvents: ['flush'],
            options: {
              stage: {
                usage: 'Stage to flush',
                shortcut: 's',
                type: 'string',
              },
              region: {
                usage: 'Region',
                shortcut: 'r',
                type: 'string',
              },
            },
          },
          status: {
            usage: 'Show cache cluster status',
            lifecycleEvents: ['show'],
          },
          disable: {
            usage: 'Disable the cache cluster entirely. Run this BEFORE removing the plugin from serverless.yml to prevent ghost billing.',
            lifecycleEvents: ['disable'],
            options: {
              stage: {
                usage: 'Stage to disable caching for',
                shortcut: 's',
                type: 'string',
              },
              region: {
                usage: 'Region',
                shortcut: 'r',
                type: 'string',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      // Package lifecycle
      'before:package:initialize': this.onBeforePackageInitialize.bind(this),
      'before:package:finalize': this.onBeforePackageFinalize.bind(this),

      // Deploy lifecycle
      'after:deploy:deploy': this.onAfterDeploy.bind(this),

      // Remove lifecycle — THIS IS WHAT THE COMMUNITY PLUGIN DOESN'T DO
      'before:remove:remove': this.onBeforeRemove.bind(this),

      // Custom commands
      'caching:flush:flush': this.onCachingFlush.bind(this),
      'caching:status:show': this.onCachingStatus.bind(this),
      'caching:disable:disable': this.onCachingDisable.bind(this),
    };

    this.defineValidationSchema();
  }

  // -----------------------------------------------------------------------
  // Lifecycle hooks
  // -----------------------------------------------------------------------

  private onBeforePackageInitialize(): void {
    this.settings = resolveSettings(this.serverless);
  }

  private async onBeforePackageFinalize(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }

    const template = this.serverless.service.provider.compiledCloudFormationTemplate;
    this.hasRestApi = restApiExistsInTemplate(template);

    if (!this.hasRestApi) {
      this.log('No REST API found. Caching settings will not be applied.');
      return;
    }

    // Add REST API ID to outputs for split-stack compatibility
    addRestApiIdOutput(template);

    // Add cache key parameters to CF template
    if (this.settings.cachingEnabled) {
      addCacheKeyParametersToTemplate(this.serverless, this.settings);
    }
  }

  private async onAfterDeploy(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }

    if (!this.hasRestApi) {
      this.log('No REST API found. Skipping cache configuration.');
      return;
    }

    // Check if caching is even defined
    if (this.settings.cachingEnabled === undefined) {
      return;
    }

    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID. Skipping cache configuration.');
      return;
    }

    const stageName = this.provider.getStage();

    // Retrieve current stage state for CloudWatch settings inheritance
    const stageMethodSettings = await getStageState(this.provider, restApiId, stageName);

    // Warn if caching is enabled but no endpoints have caching
    const allEndpoints = [...this.settings.endpoints, ...this.settings.additionalEndpoints];
    const endpointsWithCaching = allEndpoints.filter((e) => e.cachingEnabled);
    if (this.settings.cachingEnabled && endpointsWithCaching.length === 0) {
      this.log(
        'WARNING: API Gateway caching is enabled but none of the endpoints have caching enabled.',
      );
    }

    // Build and apply patch operations
    const ops = buildPatchOperations(this.settings, stageMethodSettings);
    await updateStageCache(this.provider, restApiId, stageName, ops, this.log.bind(this));

    if (this.settings.sharedApiGateway) {
      this.log(
        `Shared API Gateway mode — stage-level cluster settings skipped. ` +
        `${endpointsWithCaching.length} endpoint(s) configured.`,
      );
    } else {
      this.log(
        this.settings.cachingEnabled
          ? `Cache enabled (${this.settings.clusterSize} GB, TTL: ${this.settings.ttlInSeconds}s, ` +
            `${endpointsWithCaching.length} endpoint(s) cached)`
          : 'Cache disabled.',
      );
    }

    // Flush cache after deploy if configured
    if (this.settings.cachingEnabled && this.settings.flushOnDeploy) {
      await flushStageCache(this.provider, restApiId, stageName, this.log.bind(this));
    }
  }

  /**
   * Cleanup hook — disable caching before stack removal.
   * This is the critical fix that the community plugin doesn't implement.
   */
  private async onBeforeRemove(): Promise<void> {
    this.log('Cleaning up cache settings before stack removal...');

    try {
      const restApiId = await this.getRestApiId();
      if (!restApiId) {
        this.log('No REST API found. No cache cleanup needed.');
        return;
      }

      const stageName = this.provider.getStage();

      // Disable the cache cluster before removal
      await updateStageCache(
        this.provider,
        restApiId,
        stageName,
        [
          { op: 'replace', path: '/cacheClusterEnabled', value: 'false' },
          { op: 'replace', path: '/*/*/caching/enabled', value: 'false' },
        ],
        this.log.bind(this),
      );

      this.log('Cache cluster disabled. Stack removal can proceed.');
    } catch (error: unknown) {
      // Don't block stack removal on cache cleanup failure
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Warning: Cache cleanup failed (${message}). Proceeding with removal.`);
    }
  }

  // -----------------------------------------------------------------------
  // Custom commands
  // -----------------------------------------------------------------------

  private async onCachingFlush(): Promise<void> {
    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID.');
      return;
    }

    const stageName = this.options.stage ?? this.provider.getStage();
    await flushStageCache(this.provider, restApiId, stageName, this.log.bind(this));
  }

  private async onCachingStatus(): Promise<void> {
    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID.');
      return;
    }

    const stageName = this.provider.getStage();

    try {
      const response = await this.provider.request('APIGateway', 'getStage', {
        restApiId,
        stageName,
      });

      const cacheEnabled = response.cacheClusterEnabled as boolean;
      const cacheSize = response.cacheClusterSize as string;
      const cacheStatus = response.cacheClusterStatus as string;

      this.log('--- Cache Status ---');
      this.log(`  Enabled:  ${cacheEnabled}`);
      this.log(`  Size:     ${cacheSize ?? 'N/A'} GB`);
      this.log(`  Status:   ${cacheStatus ?? 'N/A'}`);
      this.log(`  Stage:    ${stageName}`);
      this.log(`  API ID:   ${restApiId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Failed to get cache status: ${message}`);
    }
  }

  /**
   * Fully disable caching on the live AWS environment.
   *
   * This is the safe offboarding command. The workflow is:
   *   1. sls caching disable --stage prod
   *   2. Remove the plugin from serverless.yml
   *   3. Redeploy
   *
   * Without this step, removing the plugin leaves the cache cluster running → ghost billing.
   */
  private async onCachingDisable(): Promise<void> {
    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID.');
      return;
    }

    const stageName = this.options.stage ?? this.provider.getStage();

    this.log(`Disabling cache cluster for stage '${stageName}'...`);

    try {
      // Step 1: Disable all per-method caching + the cluster
      await updateStageCache(
        this.provider,
        restApiId,
        stageName,
        [
          { op: 'replace', path: '/*/*/caching/enabled', value: 'false' },
          { op: 'replace', path: '/cacheClusterEnabled', value: 'false' },
        ],
        this.log.bind(this),
      );

      this.log('');
      this.log('✅ Cache cluster disabled successfully.');
      this.log('');
      this.log('You can now safely remove the plugin from your serverless.yml:');
      this.log('');
      this.log('  1. Remove "@interlace/serverless-plugin-caching" from plugins');
      this.log('  2. Remove the "interlaceCaching" section from custom');
      this.log('  3. Remove "caching" from function http events');
      this.log('  4. Run "sls deploy" to apply');
      this.log('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Failed to disable cache: ${message}`);
      this.log('The cache cluster may still be running. Check the AWS console.');
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async getRestApiId(): Promise<string | undefined> {
    const stackName =
      this.serverless.service.provider.stackName ??
      `${this.serverless.service.service}-${this.provider.getStage()}`;

    return resolveRestApiId(
      this.provider,
      stackName,
      this.settings?.restApiId,
      this.serverless.service.provider.apiGateway?.restApiId,
    );
  }

  private log(message: string): void {
    this.serverless.cli.log(`[interlace-caching] ${message}`);
  }

  /**
   * Register JSON schema for config validation (Serverless v3+).
   */
  private defineValidationSchema(): void {
    const handler = this.serverless.configSchemaHandler;
    if (!handler?.defineCustomProperties || !handler?.defineFunctionEventProperties) {
      return;
    }

    const perKeyInvalidationSchema = {
      type: 'object',
      properties: {
        requireAuthorization: { type: 'boolean' },
        handleUnauthorizedRequests: {
          type: 'string',
          enum: ['Ignore', 'IgnoreWithWarning', 'Fail'],
        },
      },
    };

    const cacheKeyParametersSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          mappedFrom: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['name'],
      },
    };

    handler.defineCustomProperties({
      type: 'object',
      properties: {
        interlaceCaching: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            clusterSize: {
              type: 'string',
              enum: ['0.5', '1.6', '6.1', '13.5', '28.4', '58.2', '118', '237'],
            },
            ttlInSeconds: { type: 'number', minimum: 0, maximum: 3600 },
            dataEncrypted: { type: 'boolean' },
            flushOnDeploy: { type: 'boolean' },
            sharedApiGateway: { type: 'boolean' },
            restApiId: { type: 'string' },
            basePath: { type: 'string' },
            endpointsInheritCloudWatchSettingsFromStage: { type: 'boolean' },
            perKeyInvalidation: perKeyInvalidationSchema,
            additionalEndpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  caching: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      ttlInSeconds: { type: 'number', minimum: 0, maximum: 3600 },
                      dataEncrypted: { type: 'boolean' },
                      perKeyInvalidation: perKeyInvalidationSchema,
                      cacheKeyParameters: cacheKeyParametersSchema,
                    },
                  },
                },
                required: ['method', 'path'],
              },
            },
          },
        },
      },
    });

    handler.defineFunctionEventProperties('aws', 'http', {
      type: 'object',
      properties: {
        caching: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            ttlInSeconds: { type: 'number', minimum: 0, maximum: 3600 },
            dataEncrypted: { type: 'boolean' },
            inheritCloudWatchSettingsFromStage: { type: 'boolean' },
            perKeyInvalidation: perKeyInvalidationSchema,
            cacheKeyParameters: cacheKeyParametersSchema,
          },
        },
      },
    });
  }
}

// Default export for ESM
export default InterlaceCachingPlugin;

// Named export for tree-shaking
export { InterlaceCachingPlugin };

// Re-export types for consumers
export type {
  CachingPluginConfig,
  EndpointCachingConfig,
  CacheKeyParameterConfig,
  CacheClusterSize,
  PerKeyInvalidationConfig,
  AdditionalEndpointConfig,
} from './types.js';
