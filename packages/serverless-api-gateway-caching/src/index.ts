/**
 * @interlace/serverless-api-gateway-caching
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
 *   - '@interlace/serverless-api-gateway-caching'
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
} from './framework.js';
import type { ResolvedCachingSettings, StageMethodSettings } from './types.js';
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

/**
 * API Gateway Caching Plugin for the Serverless Framework.
 *
 * Implements the {@link ServerlessPlugin} interface expected by the framework's
 * {@link https://github.com/serverless/serverless/blob/v3/lib/classes/plugin-manager.js PluginManager}.
 *
 * The framework instantiates this class via:
 * ```
 * const Plugin = importModule(pluginPath);  // handles .default ESM interop
 * new Plugin(serverless, options);
 * ```
 *
 * ## Lifecycle Integration
 *
 * This plugin hooks into the following Serverless Framework lifecycle events:
 *
 * | Hook | When | What |
 * |------|------|------|
 * | `before:package:initialize` | Before CF template generation | Resolves caching settings from YAML config |
 * | `before:package:finalize` | After CF template is compiled | Injects cache key parameters into CF resources |
 * | `after:deploy:deploy` | After CloudFormation stack update completes | Applies API Gateway stage cache settings via UpdateStage API |
 * | `before:remove:remove` | Before stack deletion | Disables cache cluster to prevent ghost billing |
 *
 * ## Custom Commands
 *
 * | Command | Usage |
 * |---------|-------|
 * | `sls caching flush` | Invalidates the entire stage cache |
 * | `sls caching status` | Shows cache cluster status, size, and stage info |
 * | `sls caching disable` | Safely disables caching before plugin removal |
 * | `sls caching preview` | Dry-run — shows the patch operations a deploy WOULD apply |
 *
 * @see {@link https://www.serverless.com/framework/docs/guides/plugins/creating-plugins Serverless Plugin Guide}
 */
class InterlaceCachingPlugin implements ServerlessPlugin {
  /** Lifecycle event hooks — consumed by the framework's PluginManager */
  public hooks: ServerlessHooks;

  /** Custom CLI commands registered with the framework */
  public commands: ServerlessCommands;

  /** Reference to the Serverless Framework instance — provides access to service config, CLI, and plugin manager */
  private serverless: ServerlessInstance;

  /** CLI options passed by the user (--stage, --region, --verbose, etc.) */
  private options: ServerlessOptions;

  /** AWS provider — wraps AWS SDK calls via `provider.request(service, method, params)` */
  private provider: AwsProvider;

  /** Resolved plugin settings (populated during `before:package:initialize`) */
  private settings: ResolvedCachingSettings | undefined;

  /** Whether a REST API resource exists in the CloudFormation template */
  private hasRestApi = false;

  /**
   * Plugin constructor — called by the Serverless Framework PluginManager.
   *
   * The framework calls `new Plugin(serverless, options)` after resolving the
   * module via `require()` (CJS) or `import()` (ESM). For CJS modules, the
   * framework's `require-with-import-fallback` utility automatically unwraps
   * `module.default` if present.
   *
   * **Important:** Configuration values in `serverless.service` are NOT fully
   * resolved during construction (variables like `${self:...}` may still be
   * present). All config-dependent logic should run inside hooks, not here.
   *
   * @param serverless - The Serverless Framework instance
   * @param options - CLI options (--stage, --region, --function, etc.)
   */
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
            usage:
              'Disable the cache cluster entirely. Run this BEFORE removing the plugin from serverless.yml to prevent ghost billing.',
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
          preview: {
            usage:
              'Preview the patch operations that a deploy would apply, without calling AWS write APIs.',
            lifecycleEvents: ['show'],
            options: {
              stage: {
                usage: 'Stage to preview',
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
      'caching:preview:show': this.onCachingPreview.bind(this),
    };

    this.defineValidationSchema();
  }

  // -----------------------------------------------------------------------
  // Lifecycle hooks
  // -----------------------------------------------------------------------

  /**
   * Hook: `before:package:initialize`
   *
   * Fires before the framework generates the CloudFormation template.
   * At this point, all `serverless.yml` variables are resolved, so we
   * can safely read `custom.interlaceCaching` and function event configs.
   *
   * Populates `this.settings` with the fully-resolved caching configuration.
   */
  private onBeforePackageInitialize(): void {
    this.settings = resolveSettings(this.serverless);
  }

  /**
   * Hook: `before:package:finalize`
   *
   * Fires after the CloudFormation template is fully compiled but before
   * it's written to disk. This is the last chance to mutate the template.
   *
   * This hook:
   * 1. Checks if a REST API resource exists in the template
   * 2. Adds a CF Output for the REST API ID (split-stack compatibility)
   * 3. Injects `CacheKeyParameters`, `CacheNamespace`, and
   *    `Integration.RequestParameters` into `AWS::ApiGateway::Method` resources
   *
   * These CF-level changes are required because the AWS UpdateStage API
   * (used in `after:deploy:deploy`) can only enable/disable caching and set
   * TTL — it cannot configure which request parameters form the cache key.
   */
  private async onBeforePackageFinalize(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }

    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate;
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

  /**
   * Hook: `after:deploy:deploy`
   *
   * Fires after the CloudFormation stack update completes successfully.
   * At this point the REST API and all Lambda functions are deployed.
   *
   * This hook applies the **runtime** cache configuration via the AWS
   * `APIGateway.updateStage` API. This is necessary because CloudFormation
   * cannot manage stage-level cache settings declaratively — they must be
   * applied imperatively after deployment.
   *
   * Operations performed:
   * 1. Resolves the REST API ID (from CF stack, outputs, or config)
   * 2. Retrieves current stage method settings (for CloudWatch inheritance)
   * 3. Builds patch operations (enable/disable cluster, per-method TTL, encryption)
   * 4. Applies operations in chunks of 80 (AWS API limit) with jittered backoff
   * 5. Optionally flushes the cache if `flushOnDeploy` is true
   *
   * For `ANY` method endpoints, caching is enabled only for GET requests
   * and explicitly disabled for all other HTTP methods.
   */
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
      this.log(
        'Unable to determine REST API ID. Skipping cache configuration.',
      );
      return;
    }

    const stageName = this.provider.getStage();

    // Retrieve current stage state for CloudWatch settings inheritance
    const stageMethodSettings = await getStageState(
      this.provider,
      restApiId,
      stageName,
    );

    // Warn if caching is enabled but no endpoints have caching
    const allEndpoints = [
      ...this.settings.endpoints,
      ...this.settings.additionalEndpoints,
    ];
    const endpointsWithCaching = allEndpoints.filter((e) => e.cachingEnabled);
    if (this.settings.cachingEnabled && endpointsWithCaching.length === 0) {
      this.log(
        'WARNING: API Gateway caching is enabled but none of the endpoints have caching enabled.',
      );
    }

    // Build and apply patch operations
    const ops = buildPatchOperations(this.settings, stageMethodSettings);
    await updateStageCache(
      this.provider,
      restApiId,
      stageName,
      ops,
      this.log.bind(this),
    );

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
      await flushStageCache(
        this.provider,
        restApiId,
        stageName,
        this.log.bind(this),
      );
    }
  }

  /**
   * Cleanup hook — disable caching before stack removal.
   * This is the critical fix that the community plugin doesn't implement.
   */
  private async onBeforeRemove(): Promise<void> {
    this.log('Cleaning up cache settings before stack removal...');

    try {
      if (!this.settings) {
        this.settings = resolveSettings(this.serverless);
      }
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
      this.log(
        `Warning: Cache cleanup failed (${message}). Proceeding with removal.`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Custom commands
  // -----------------------------------------------------------------------

  private async onCachingFlush(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }
    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID.');
      return;
    }

    const stageName = this.options.stage ?? this.provider.getStage();
    await flushStageCache(
      this.provider,
      restApiId,
      stageName,
      this.log.bind(this),
    );
  }

  private async onCachingStatus(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }
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
   *   1. sls caching disable --stage production
   *   2. Remove the plugin from serverless.yml
   *   3. Redeploy
   *
   * Without this step, removing the plugin leaves the cache cluster running → ghost billing.
   */
  private async onCachingDisable(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }
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
      this.log(
        'You can now safely remove the plugin from your serverless.yml:',
      );
      this.log('');
      this.log(
        '  1. Remove "@interlace/serverless-api-gateway-caching" from plugins',
      );
      this.log('  2. Remove the "interlaceCaching" section from custom');
      this.log('  3. Remove "caching" from function http events');
      this.log('  4. Run "sls deploy" to apply');
      this.log('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Failed to disable cache: ${message}`);
      this.log(
        'The cache cluster may still be running. Check the AWS console.',
      );
    }
  }

  /**
   * Dry-run — print the patch operations a `sls deploy` would apply, without
   * calling AWS write APIs (`updateStage` / `flushStageCache`).
   *
   * Read-only AWS calls are still made:
   * - `getStage` (via {@link getStageState}) for CloudWatch settings inheritance
   * - REST API ID resolution (CloudFormation describe / output lookup)
   *
   * Useful for verifying config before committing, in CI gates, and in launch
   * articles where readers want to see the effect without billing risk.
   */
  private async onCachingPreview(): Promise<void> {
    if (!this.settings) {
      this.settings = resolveSettings(this.serverless);
    }

    const restApiId = await this.getRestApiId();
    if (!restApiId) {
      this.log('Unable to determine REST API ID. Skipping preview.');
      return;
    }

    const stageName = this.options.stage ?? this.provider.getStage();

    let stageMethodSettings: Record<string, StageMethodSettings> = {};
    try {
      stageMethodSettings = await getStageState(
        this.provider,
        restApiId,
        stageName,
      );
    } catch {
      // Read-only failure is non-fatal for a preview; emit empty inheritance.
      stageMethodSettings = {};
    }

    const ops = buildPatchOperations(this.settings, stageMethodSettings);

    this.log('--- Cache Preview (dry-run) ---');
    this.log(`  REST API:   ${restApiId}`);
    this.log(`  Stage:      ${stageName}`);
    this.log(
      `  Cluster:    ${this.settings.cachingEnabled ? 'enabled' : 'disabled'}`,
    );
    if (this.settings.cachingEnabled) {
      this.log(`  Size:       ${this.settings.clusterSize} GB`);
      this.log(`  Default TTL: ${this.settings.ttlInSeconds}s`);
    }
    this.log(
      `  Operations: ${ops.length} (would chunk into ${Math.max(1, Math.ceil(ops.length / 80))} UpdateStage call(s))`,
    );
    this.log('');

    if (ops.length === 0) {
      this.log('  (no patch operations)');
      return;
    }

    for (const op of ops) {
      this.log(`  ${op.op.padEnd(7)} ${op.path}  →  ${op.value}`);
    }
    this.log('');
    this.log('No AWS write APIs were called. Run `sls deploy` to apply.');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the REST API ID for the current deployment.
   *
   * Resolution priority:
   * 1. Explicit `restApiId` from plugin config (`custom.interlaceCaching.restApiId`)
   * 2. Shared gateway ID from provider config (`provider.apiGateway.restApiId`)
   * 3. CloudFormation stack resource lookup (`ApiGatewayRestApi`)
   * 4. CloudFormation stack output (for split-stack deployments)
   *
   * @returns The physical REST API ID, or `undefined` if no API Gateway exists
   */
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

  /**
   * Log a message through the Serverless Framework CLI.
   * All messages are prefixed with `[interlace-caching]` for easy filtering.
   *
   * @param message - The message to log
   */
  private log(message: string): void {
    this.serverless.cli.log(`[interlace-caching] ${message}`);
  }

  /**
   * Register JSON schema for config validation (Serverless v3+).
   */
  private defineValidationSchema(): void {
    const handler = this.serverless.configSchemaHandler;
    if (
      !handler?.defineCustomProperties ||
      !handler?.defineFunctionEventProperties
    ) {
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
                      ttlInSeconds: {
                        type: 'number',
                        minimum: 0,
                        maximum: 3600,
                      },
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

/**
 * Default export — this is what the Serverless Framework plugin loader expects.
 *
 * The framework v4 PluginManager (`packages/serverless/lib/classes/plugin-manager.js`)
 * resolves the plugin entry via `createRequire(...).resolve(name)` (which honors the
 * `require` condition in `package.json` `exports` → `dist/index.cjs`), then loads it
 * via `await import(pathToFileURL(path))`. Node's CJS↔ESM interop sets the resulting
 * namespace as `{ default: module.exports }`. The framework then does
 * `Plugin = Plugin.default || Plugin` to unwrap.
 *
 * For that unwrap to land on a constructor (not a wrapper object), our CJS output
 * MUST be `module.exports = InterlaceCachingPlugin` (NOT
 * `module.exports.default = InterlaceCachingPlugin`). Vite achieves this with
 * `output.exports: 'default'` plus a single default export from this entry.
 *
 * For named TypeScript imports, the bundle attaches `InterlaceCachingPlugin` as a
 * property on the default export at the bottom of this file (so
 * `import { InterlaceCachingPlugin } from '...'` continues to work for TS users).
 */
export default InterlaceCachingPlugin;

// Runtime named-property shim: CJS consumers doing
// `const { InterlaceCachingPlugin } = require('...')` still resolve to the class.
// (The TypeScript `import { InterlaceCachingPlugin }` form is no longer available —
// `Rollup output.exports: 'default'` requires a single default export from the entry —
// but the runtime symbol is preserved for parity with documentation.)
(
  InterlaceCachingPlugin as unknown as {
    InterlaceCachingPlugin: typeof InterlaceCachingPlugin;
  }
).InterlaceCachingPlugin = InterlaceCachingPlugin;

/** Re-exported configuration types for consumers who need type-safe config objects */
export type {
  CachingPluginConfig,
  EndpointCachingConfig,
  CacheKeyParameterConfig,
  CacheClusterSize,
  PerKeyInvalidationConfig,
  AdditionalEndpointConfig,
} from './types.js';
