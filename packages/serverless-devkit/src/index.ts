/**
 * @interlace/serverless-devkit
 *
 * TypeScript-first configuration toolkit for Serverless Framework.
 * Zero dependencies. Full IntelliSense. Raw-First compatible.
 *
 * @example
 * ```ts
 * // serverless.ts
 * import { defineConfig } from '@interlace/serverless-devkit';
 *
 * export default defineConfig({
 *   service: 'my-api',
 *   provider: {
 *     name: 'aws',
 *     runtime: 'nodejs20.x',
 *     region: 'us-east-1',
 *   },
 *   functions: {
 *     hello: {
 *       handler: 'src/handler.hello',
 *       events: [{ http: { path: '/hello', method: 'get' } }],
 *     },
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { ServerlessConfig } from './types.js';

/**
 * Define a Serverless Framework configuration with full type safety.
 *
 * This is the main entry point for `serverless.ts` files.
 * It provides IntelliSense for the entire Serverless config surface
 * while being a simple identity function at runtime (zero overhead).
 *
 * Works with all Serverless Framework config formats:
 * - `serverless.ts` (recommended — full IntelliSense)
 * - `serverless.js` (works, no types)
 * - `serverless.yml` (use compat helpers for typed custom blocks)
 *
 * @param config - The Serverless Framework configuration object.
 * @returns The same config object, unchanged.
 */
export function defineConfig(config: ServerlessConfig): ServerlessConfig {
  return config;
}

// Re-export all types for consumers
export type {
  // Top-level
  ServerlessConfig,
  BuildConfig,
  EsbuildConfig,
  PackageConfig,
  ResourcesConfig,
  CloudFormationResource,

  // Provider
  ProviderConfig,
  DeploymentBucketConfig,
  VpcConfig,
  LoggingConfig,
  ApiGatewayConfig,

  // Functions
  FunctionConfig,
  DeadLetterConfig,
  FunctionEventMap,

  // Events
  HttpEvent,
  HttpCachingConfig,
  HttpRequestConfig,
  CorsConfig,
  AuthorizerConfig,
  PerKeyInvalidationConfig,
  CacheKeyParameter,
  ScheduleEvent,
  SqsEvent,
  SnsEvent,
  StreamEvent,
  S3Event,
  WebSocketEvent,
  EventBridgeEvent,

  // IAM
  IamStatement,
  IamRoleConfig,

  // Plugin interface
  ServerlessInstance,
  ServerlessOptions,
  ServerlessPlugin,
  ServerlessHooks,
  ServerlessCommands,
  AwsProvider,
} from './types.js';

// Re-export function helpers
export { defineFunction, defineFunctions } from './functions.js';
