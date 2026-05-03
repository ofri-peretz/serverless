/**
 * @interlace/serverless-devkit — Functions helpers
 *
 * Typed function definition builder.
 */

import type { FunctionConfig } from './types.js';

/**
 * Define a Lambda function with full type safety.
 *
 * @example
 * ```ts
 * import { defineFunction } from '@interlace/serverless-devkit/functions';
 *
 * export const getUser = defineFunction({
 *   handler: 'src/handlers/user.get',
 *   memorySize: 256,
 *   timeout: 10,
 *   events: [
 *     { http: { path: '/users/{id}', method: 'get' } },
 *   ],
 * });
 * ```
 */
export function defineFunction(config: FunctionConfig): FunctionConfig {
  return config;
}

/**
 * Define multiple Lambda functions at once.
 *
 * @example
 * ```ts
 * import { defineFunctions } from '@interlace/serverless-devkit/functions';
 *
 * export const functions = defineFunctions({
 *   getUser: { handler: 'src/handlers/user.get' },
 *   createUser: { handler: 'src/handlers/user.create' },
 * });
 * ```
 */
export function defineFunctions(
  functions: Record<string, FunctionConfig>,
): Record<string, FunctionConfig> {
  return functions;
}
