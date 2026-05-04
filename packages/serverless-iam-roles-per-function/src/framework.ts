/**
 * @interlace/serverless-iam-roles-per-function — Framework integration types.
 *
 * Slice of the Serverless Framework v3 + v4 plugin contract this plugin uses.
 * The plugin is verified against:
 * - v3 (legacy): `serverless@^3.40.0` — `provider.iam.role.statements` syntax
 *   plus the deprecated `provider.iamRoleStatements` fallback.
 * - v4 (current): `serverless@^4.0.0` — same plugin contract; v3 plugins load
 *   identically. Verified against `lib/classes/plugin-manager.js`,
 *   `lib/classes/service.js`, and `lib/plugins/aws/provider.js` in v4.35.0.
 *
 * Why types are inlined here (not imported from `@interlace/serverless-devkit`):
 * the published `.d.ts` must be self-contained so users installing only this
 * plugin don't fail to resolve a sibling package.
 */

/** A single CloudFormation resource (`AWS::IAM::Role`, `AWS::Lambda::Function`, …) */
export interface CloudFormationResource {
  Type: string;
  Properties?: Record<string, unknown>;
  DependsOn?: string[] | string;
  [key: string]: unknown;
}

/** Compiled CloudFormation template handed to plugins during `package` phase */
export interface CompiledCloudFormationTemplate {
  Resources: Record<string, CloudFormationResource>;
  Outputs?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * IAM Policy Statement — covers the full AWS IAM grammar. We type it strictly
 * so validators can pattern-match on shape, but `Resource`/`Action` allow
 * arrays since the IAM spec does. CloudFormation intrinsic functions
 * (`!Ref`, `!Sub`, `Fn::GetAtt`) appear as objects — covered by `unknown`.
 */
export interface IamStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: string | string[] | Record<string, unknown> | unknown[];
  NotResource?: string | string[] | Record<string, unknown> | unknown[];
  Principal?: Record<string, unknown> | string;
  NotPrincipal?: Record<string, unknown> | string;
  Condition?: Record<string, Record<string, string | string[]>>;
}

export interface IamPolicy {
  Version?: string;
  Statement: IamStatement[];
}

export interface IamRoleProperties {
  RoleName?: unknown;
  AssumeRolePolicyDocument?: unknown;
  Policies?: Array<{
    PolicyName?: unknown;
    PolicyDocument: IamPolicy;
  }>;
  ManagedPolicyArns?: unknown[];
  PermissionsBoundary?: string | Record<string, unknown>;
  [key: string]: unknown;
}

/** Per-function event types this plugin reads (for auto-permission injection) */
export interface ServerlessSqsEvent {
  arn?: string | Record<string, unknown>;
  batchSize?: number;
  [key: string]: unknown;
}

export interface ServerlessStreamEvent {
  arn: string | Record<string, unknown>;
  type?: 'dynamodb' | 'kinesis';
  batchSize?: number;
  [key: string]: unknown;
}

export interface ServerlessEventBridgeEvent {
  eventBus?: string | Record<string, unknown>;
  pattern?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ServerlessS3Event {
  bucket?: string | Record<string, unknown>;
  event?: string;
  [key: string]: unknown;
}

export interface ServerlessFunctionEvent {
  sqs?: ServerlessSqsEvent | string;
  stream?: ServerlessStreamEvent | string;
  eventBridge?: ServerlessEventBridgeEvent;
  s3?: ServerlessS3Event | string;
  [key: string]: unknown;
}

/**
 * Per-function config slice. Includes the plugin's custom properties
 * (`iamRoleStatements`, `iamPermissionsBoundary`, etc.) plus the framework's
 * `role` and `vpc` properties this plugin reads.
 */
export interface ServerlessFunctionConfig {
  name?: string;
  handler?: string;
  events?: ServerlessFunctionEvent[];
  vpc?: Record<string, unknown>;
  onError?: string | Record<string, unknown>;
  role?: string | Record<string, unknown>;

  // Plugin-specific properties — declared via configSchemaHandler in src/index.ts
  iamRoleStatements?: IamStatement[];
  iamRoleStatementsInherit?: boolean;
  iamRoleStatementsName?: string;
  iamPermissionsBoundary?: string;
  iamManagedPolicies?: string[];
  iamRoleStatementsTemplate?: string;

  [key: string]: unknown;
}

export interface ServerlessProviderIam {
  role?: {
    statements?: IamStatement[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ServerlessInstance {
  service: {
    service: string;
    getServiceName?: () => string;
    custom?: Record<string, unknown>;
    provider: {
      name?: string;
      stage?: string;
      region?: string;
      stackName?: string;

      // v3+: provider.iam.role.statements (current)
      iam?: ServerlessProviderIam;

      // v2 deprecated, still seen in many v3 codebases that never migrated.
      // Read-only fallback.
      iamRoleStatements?: IamStatement[];

      vpc?: Record<string, unknown>;
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
  classes?: {
    Error: new (msg: string) => Error;
  };
  cli: {
    log(message: string, entity?: string, opts?: unknown): void;
  };
  configSchemaHandler?: {
    defineCustomProperties(schema: Record<string, unknown>): void;
    /**
     * v3+ name. v2 used `defineFunctionProperties` (non-event scoped) — the
     * plugin uses both via runtime presence checks for maximum compat.
     */
    defineFunctionProperties?(
      provider: string,
      schema: Record<string, unknown>,
    ): void;
    defineFunctionEventProperties?(
      provider: string,
      event: string,
      schema: Record<string, unknown>,
    ): void;
  };

  /** Framework version (v3 returns string like '3.40.0'; v4 returns string like '4.5.0'). */
  version?: string;
}

export interface AwsProvider {
  getStage(): string;
  getRegion(): string;
  naming: {
    getRoleName(): unknown;
    getRoleLogicalId(): string;
    getLambdaLogicalId(functionName: string): string;
    getNormalizedFunctionName(functionName: string): string;
    getLogGroupName(functionName: string): string;
  };
  request(
    service: string,
    method: string,
    params: Record<string, unknown>,
    options?: { region?: string; useCache?: boolean },
  ): Promise<Record<string, unknown>>;
}

export interface ServerlessOptions {
  stage?: string;
  region?: string;
  function?: string;
  verbose?: boolean;
  [key: string]: unknown;
}

export type ServerlessHooks = Record<string, () => void | Promise<void>>;

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

export interface ServerlessPlugin {
  hooks: ServerlessHooks;
  commands?: ServerlessCommands;
}
