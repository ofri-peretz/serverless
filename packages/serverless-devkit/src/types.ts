/**
 * @interlace/serverless-devkit — Core Types
 *
 * Comprehensive type definitions for Serverless Framework v3/v4 AWS provider.
 * These types enable IntelliSense and compile-time validation for serverless.ts.
 *
 * @remarks
 * - All types support the "Raw-First" mandate: YAML configs map 1:1 to these types.
 * - Optional fields use `?` — only required fields are mandatory.
 * - AWS SDK v3 types are NOT imported to keep this zero-dependency.
 */

// ---------------------------------------------------------------------------
// IAM
// ---------------------------------------------------------------------------

/** IAM policy statement */
export interface IamStatement {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
}

/** IAM role configuration for per-function roles */
export interface IamRoleConfig {
  statements?: IamStatement[];
  name?: string;
  path?: string;
  permissionsBoundary?: string;
  managedPolicies?: string[];
  tags?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** HTTP API event (API Gateway v1 REST or v2 HTTP) */
export interface HttpEvent {
  path: string;
  method:
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options'
    | 'any';
  cors?: boolean | CorsConfig;
  authorizer?: AuthorizerConfig | string;
  private?: boolean;
  request?: HttpRequestConfig;
  caching?: HttpCachingConfig;
}

export interface CorsConfig {
  origin?: string;
  origins?: string[];
  headers?: string[];
  methods?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
  cacheControl?: string;
}

export interface AuthorizerConfig {
  name?: string;
  arn?: string;
  resultTtlInSeconds?: number;
  identitySource?: string;
  identityValidationExpression?: string;
  type?: 'token' | 'request' | 'cognito_user_pools';
  claims?: string[];
  scopes?: string[];
}

export interface HttpRequestConfig {
  parameters?: {
    querystrings?: Record<
      string,
      boolean | { required: boolean; mappedValue?: string }
    >;
    headers?: Record<
      string,
      boolean | { required: boolean; mappedValue?: string }
    >;
    paths?: Record<string, boolean>;
  };
  schemas?: Record<string, Record<string, unknown>>;
  passThrough?: 'WHEN_NO_MATCH' | 'WHEN_NO_TEMPLATES' | 'NEVER';
  template?: Record<string, string>;
}

export interface HttpCachingConfig {
  enabled?: boolean;
  ttlInSeconds?: number;
  dataEncrypted?: boolean;
  perKeyInvalidation?: PerKeyInvalidationConfig;
  cacheKeyParameters?: CacheKeyParameter[];
}

export interface PerKeyInvalidationConfig {
  requireAuthorization?: boolean;
  handleUnauthorizedRequests?: 'Ignore' | 'IgnoreWithWarning' | 'Fail';
}

export interface CacheKeyParameter {
  name: string;
  value?: string;
}

/** Schedule event (EventBridge / CloudWatch Events) */
export interface ScheduleEvent {
  rate: string | string[];
  enabled?: boolean;
  name?: string;
  description?: string;
  input?: Record<string, unknown> | string;
  inputPath?: string;
  inputTransformer?: {
    inputPathsMap: Record<string, string>;
    inputTemplate: string;
  };
}

/** SQS event */
export interface SqsEvent {
  arn: string;
  batchSize?: number;
  maximumBatchingWindow?: number;
  enabled?: boolean;
  functionResponseType?: 'ReportBatchItemFailures';
  filterPatterns?: Record<string, unknown>[];
}

/** SNS event */
export interface SnsEvent {
  arn?: string;
  topicName?: string;
  displayName?: string;
  filterPolicy?: Record<string, unknown>;
  filterPolicyScope?: 'MessageAttributes' | 'MessageBody';
  redrivePolicy?: {
    deadLetterTargetArn: string;
  };
}

/** DynamoDB Streams event */
export interface StreamEvent {
  arn: string;
  type?: 'dynamodb' | 'kinesis';
  batchSize?: number;
  startingPosition?: 'TRIM_HORIZON' | 'LATEST' | 'AT_TIMESTAMP';
  enabled?: boolean;
  maximumRetryAttempts?: number;
  bisectBatchOnFunctionError?: boolean;
  maximumBatchingWindow?: number;
  maximumRecordAgeInSeconds?: number;
  parallelizationFactor?: number;
  filterPatterns?: Record<string, unknown>[];
  functionResponseType?: 'ReportBatchItemFailures';
  destinations?: {
    onFailure?: string;
  };
}

/** S3 event */
export interface S3Event {
  bucket: string;
  event?: string;
  rules?: Array<{ prefix?: string; suffix?: string }>;
  existing?: boolean;
}

/** WebSocket event */
export interface WebSocketEvent {
  route: string;
  authorizer?: AuthorizerConfig | string;
  routeResponseSelectionExpression?: string;
}

/** EventBridge event */
export interface EventBridgeEvent {
  eventBus?: string;
  schedule?: string;
  pattern?: {
    source?: string[];
    'detail-type'?: string[];
    detail?: Record<string, unknown>;
  };
  input?: Record<string, unknown> | string;
  inputPath?: string;
  inputTransformer?: {
    inputPathsMap: Record<string, string>;
    inputTemplate: string;
  };
}

/** Union of all function event types */
export interface FunctionEventMap {
  http?: HttpEvent;
  httpApi?: HttpEvent;
  schedule?: ScheduleEvent | string;
  sqs?: SqsEvent | string;
  sns?: SnsEvent | string;
  stream?: StreamEvent | string;
  s3?: S3Event | string;
  websocket?: WebSocketEvent;
  eventBridge?: EventBridgeEvent;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** Dead letter queue configuration */
export interface DeadLetterConfig {
  sqs?: string;
  sns?: string;
  targetArn?: string;
}

/** Lambda function configuration */
export interface FunctionConfig {
  handler: string;
  name?: string;
  description?: string;
  runtime?: string;
  memorySize?: number;
  timeout?: number;
  architecture?: 'x86_64' | 'arm64';
  ephemeralStorageSize?: number;
  environment?: Record<string, string>;
  tags?: Record<string, string>;
  layers?: string[];
  events?: FunctionEventMap[];
  iam?: { role: IamRoleConfig | string };
  vpc?: VpcConfig;
  reservedConcurrency?: number;
  provisionedConcurrency?: number;
  tracing?: 'Active' | 'PassThrough' | boolean;
  snapStart?: boolean;
  deadLetter?: DeadLetterConfig;
  package?: PackageConfig;
  url?:
    | boolean
    | {
        authorizer?: 'aws_iam' | 'none';
        cors?: boolean | CorsConfig;
        invokeMode?: 'BUFFERED' | 'RESPONSE_STREAM';
      };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface VpcConfig {
  securityGroupIds: string[];
  subnetIds: string[];
}

export interface LoggingConfig {
  restApi?:
    | boolean
    | {
        accessLogging?: boolean;
        executionLogging?: boolean;
        level?: 'INFO' | 'ERROR';
        fullExecutionData?: boolean;
        role?: string;
        roleManagedExternally?: boolean;
      };
  httpApi?:
    | boolean
    | {
        format?: string;
      };
  websocket?: boolean;
}

export interface ApiGatewayConfig {
  restApiId?: string;
  restApiRootResourceId?: string;
  restApiResources?: Record<string, string>[];
  websocketApiId?: string;
  apiKeySourceType?: 'HEADER' | 'AUTHORIZER';
  minimumCompressionSize?: number;
  description?: string;
  binaryMediaTypes?: string[];
  metrics?: boolean;
  shouldStartNameWithService?: boolean;
  usagePlan?: Record<string, unknown>;
  resourcePolicy?: IamStatement[];
}

/** AWS provider configuration */
export interface ProviderConfig {
  name: 'aws';
  runtime?: string;
  stage?: string;
  region?: string;
  profile?: string;
  memorySize?: number;
  timeout?: number;
  architecture?: 'x86_64' | 'arm64';
  versionFunctions?: boolean;
  environment?: Record<string, string>;
  tags?: Record<string, string>;
  stackTags?: Record<string, string>;
  stackName?: string;
  apiName?: string;
  endpointType?: 'REGIONAL' | 'EDGE' | 'PRIVATE';
  deploymentBucket?: string | DeploymentBucketConfig;
  deploymentPrefix?: string;
  tracing?: { lambda?: boolean; apiGateway?: boolean };
  logRetentionInDays?: number;
  iam?: {
    role?: IamRoleConfig | string;
    deploymentRole?: string;
  };
  vpc?: VpcConfig;
  apiGateway?: ApiGatewayConfig;
  logs?: LoggingConfig;
  layers?: string[];
  lambdaHashingVersion?: '20201221';
}

export interface DeploymentBucketConfig {
  name?: string;
  serverSideEncryption?: string;
  tags?: Record<string, string>;
  blockPublicAccess?: boolean;
  maxPreviousDeploymentArtifacts?: number;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** v4 native esbuild configuration */
export interface EsbuildConfig {
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
  target?: string;
  external?: string[];
  exclude?: string[];
  packages?: 'external';
}

export interface BuildConfig {
  esbuild?: EsbuildConfig | false;
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export interface PackageConfig {
  individually?: boolean;
  include?: string[];
  exclude?: string[];
  patterns?: string[];
  artifact?: string;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface CloudFormationResource {
  Type: string;
  Properties?: Record<string, unknown>;
  DependsOn?: string | string[];
  Condition?: string;
  DeletionPolicy?: 'Delete' | 'Retain' | 'Snapshot';
  UpdateReplacePolicy?: 'Delete' | 'Retain' | 'Snapshot';
  Metadata?: Record<string, unknown>;
}

export interface ResourcesConfig {
  Resources?: Record<string, CloudFormationResource>;
  Outputs?: Record<
    string,
    {
      Description?: string;
      Value: unknown;
      Export?: { Name: string };
      Condition?: string;
    }
  >;
  Conditions?: Record<string, unknown>;
  extensions?: Record<string, Partial<CloudFormationResource>>;
}

// ---------------------------------------------------------------------------
// Top-level Serverless config
// ---------------------------------------------------------------------------

/** Full Serverless Framework configuration */
export interface ServerlessConfig {
  service: string;
  frameworkVersion?: string;
  configValidationMode?: 'error' | 'warn' | 'off';
  useDotenv?: boolean;
  disabledDeprecations?: string[] | '*';

  provider: ProviderConfig;
  build?: BuildConfig;
  package?: PackageConfig;

  functions?: Record<string, FunctionConfig>;
  layers?: Record<
    string,
    {
      path: string;
      name?: string;
      description?: string;
      compatibleRuntimes?: string[];
      compatibleArchitectures?: string[];
      licenseInfo?: string;
      allowedAccounts?: string[];
      retain?: boolean;
    }
  >;

  resources?: ResourcesConfig;
  plugins?: string[];
  custom?: Record<string, unknown>;

  params?: Record<string, Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Serverless Framework plugin interface
// ---------------------------------------------------------------------------

export interface ServerlessInstance {
  service: {
    service: string;
    getServiceName(): string;
    custom: Record<string, unknown>;
    provider: {
      name: string;
      stage: string;
      region: string;
      stackName?: string;
      profile?: string;
      apiGateway?: ApiGatewayConfig;
      compiledCloudFormationTemplate: {
        Resources: Record<string, CloudFormationResource>;
        Outputs?: Record<string, unknown>;
      };
    };
    functions: Record<string, FunctionConfig>;
    getAllFunctions(): string[];
    getFunction(name: string): FunctionConfig & { name: string };
  };
  providers: {
    aws: AwsProvider;
  };
  cli: {
    /**
     * Legacy plugin log surface — verified against `lib/classes/cli.js` in
     * `serverless/serverless@4.35.0`. The third arg is accepted but unused by
     * the framework; only `message` (and optional `entity` prefix) is rendered.
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
  pluginManager: {
    spawn(command: string): Promise<void>;
  };
}

/**
 * AWS provider — verified against `lib/plugins/aws/provider.js` in
 * `serverless/serverless@4.35.0`:
 * - `getStage()` returns `string` with `'dev'` fallback (line 3588)
 * - `getRegion()` returns `string` with `'us-east-1'` fallback (line 3372)
 * - `getCredentials()` is **async** and returns the resolved credentials object (line 3316)
 * - `request()` accepts a 4th options arg with `{ region?, useCache? }` (line 3285)
 */
export interface AwsProvider {
  getStage(): string;
  getRegion(): string;
  getCredentials(): Promise<unknown>;
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

export interface ServerlessHooks {
  [hook: string]: () => void | Promise<void>;
}

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

/** Base interface that all Serverless plugins must implement */
export interface ServerlessPlugin {
  hooks: ServerlessHooks;
  commands?: ServerlessCommands;
}
