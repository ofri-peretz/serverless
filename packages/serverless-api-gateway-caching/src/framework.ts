/**
 * @interlace/serverless-api-gateway-caching — Framework integration types
 *
 * These describe the slice of the Serverless Framework v3/v4 plugin contract
 * that this plugin actually uses. They are intentionally narrow:
 *
 * - Only fields the plugin reads or writes are typed.
 * - All other framework state is described as `Record<string, unknown>`.
 *
 * **Verified against** `serverless/serverless@4.35.0` (the upstream framework
 * monorepo) — specifically `packages/serverless/lib/classes/{service,cli}.js`,
 * `packages/serverless/lib/classes/config-schema-handler/index.js`,
 * `packages/serverless/lib/classes/plugin-manager.js`, and
 * `packages/serverless/lib/plugins/aws/provider.js`. The types match the v3
 * surface as well; v3 plugins load identically in v4.
 *
 * **Why not import from `@interlace/serverless-devkit`?**
 *
 * The caching plugin must be installable on its own. If types were imported
 * from another package, the published `.d.ts` files would carry that import
 * and TypeScript users installing only the caching plugin would fail to
 * resolve the module. Inlining keeps the plugin self-contained.
 *
 * If you're authoring a new plugin, prefer the full types in
 * `@interlace/serverless-devkit` — they describe the entire framework
 * surface, not just one plugin's slice.
 */

/** A single CloudFormation resource (`AWS::ApiGateway::Method`, etc.) */
export interface CloudFormationResource {
  Type: string;
  Properties?: Record<string, unknown>;
}

/** Compiled CloudFormation template handed to plugins during the package phase */
export interface CompiledCloudFormationTemplate {
  Resources: Record<string, CloudFormationResource>;
  Outputs?: Record<string, unknown>;
}

/** HTTP event slice — only the fields this plugin reads */
export interface ServerlessHttpEvent {
  path: string;
  method: string;
  caching?: Record<string, unknown>;
}

/** Function event map — `http` and `httpApi` are what we care about */
export interface ServerlessFunctionEvent {
  http?: ServerlessHttpEvent | string;
  httpApi?: ServerlessHttpEvent | string;
  // Other event types (sqs, schedule, sns, …) are ignored by this plugin.
  [key: string]: unknown;
}

/** Lambda function configuration — only `events` is read */
export interface ServerlessFunctionConfig {
  handler?: string;
  events?: ServerlessFunctionEvent[];
  [key: string]: unknown;
}

/**
 * Serverless Framework instance — the first argument the framework's
 * PluginManager passes to `new Plugin(serverless, options)`.
 */
export interface ServerlessInstance {
  service: {
    service: string;
    getServiceName(): string;
    custom?: Record<string, unknown>;
    provider: {
      name?: string;
      stage?: string;
      region?: string;
      stackName?: string;
      apiGateway?: {
        restApiId?: string;
        [key: string]: unknown;
      };
      compiledCloudFormationTemplate: CompiledCloudFormationTemplate;
      [key: string]: unknown;
    };
    functions: Record<string, ServerlessFunctionConfig>;
    getAllFunctions(): string[];
    getFunction(name: string): ServerlessFunctionConfig & { name: string };
  };
  providers: {
    aws: AwsProvider;
  };
  cli: {
    /**
     * Legacy plugin log surface (matches `Service.CLI.log(message, entity?, opts?)`
     * in `lib/classes/cli.js`). All three args are accepted by the framework but
     * only `message` is meaningful — the framework prefixes with `entity:` if set.
     */
    log(message: string, entity?: string, opts?: unknown): void;
  };
  configSchemaHandler?: {
    defineCustomProperties(schema: Record<string, unknown>): void;
    defineFunctionEventProperties(
      provider: string,
      event: string,
      schema: Record<string, unknown>,
    ): void;
  };
}

/**
 * AWS provider — wraps AWS SDK calls via `provider.request(service, method, params)`.
 *
 * Verified against `lib/plugins/aws/provider.js` (v4.35.0):
 * - `getStage()` returns `string` with `'dev'` fallback (line 3588)
 * - `getRegion()` returns `string` with `'us-east-1'` fallback (line 3372)
 * - `request()` is async and accepts a 4th options arg with `{ region?, useCache? }`
 *   (line 3285) — the response is the AWS SDK call result.
 */
export interface AwsProvider {
  getStage(): string;
  getRegion(): string;
  request(
    service: string,
    method: string,
    params: Record<string, unknown>,
    options?: { region?: string; useCache?: boolean },
  ): Promise<Record<string, unknown>>;
}

/**
 * CLI options — passed as the second argument to plugin constructors and
 * available on hook invocations as `--stage`, `--region`, etc.
 */
export interface ServerlessOptions {
  stage?: string;
  region?: string;
  function?: string;
  verbose?: boolean;
  [key: string]: unknown;
}

/** Lifecycle event hook map — keys are framework lifecycle event names */
export type ServerlessHooks = Record<string, () => void | Promise<void>>;

/**
 * Custom CLI command map — describes the `serverless` CLI commands a plugin
 * registers. Supports nested subcommands via `commands`.
 */
export interface ServerlessCommands {
  [command: string]: {
    usage?: string;
    lifecycleEvents?: string[];
    options?: Record<
      string,
      {
        usage?: string;
        shortcut?: string;
        required?: boolean;
        type?: string;
      }
    >;
    commands?: ServerlessCommands;
  };
}

/**
 * Base interface that all Serverless plugins must implement.
 *
 * The framework's PluginManager calls `new Plugin(serverless, options, pluginUtils)`
 * (3 args in v4 — see `lib/classes/plugin-manager.js:330`). This interface only
 * constrains the *instance* shape (hooks + optional commands), so plugin
 * constructors can be `(serverless, options)`, `(serverless, options, utils)`,
 * or any superset — JavaScript ignores extra constructor args.
 */
export interface ServerlessPlugin {
  hooks: ServerlessHooks;
  commands?: ServerlessCommands;
}
