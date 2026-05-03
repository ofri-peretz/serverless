/**
 * Minimal Lambda handler for the E2E test.
 *
 * Returns a payload with a generation timestamp so the orchestrator can
 * detect cache hits: when two responses share the same `generatedAt`,
 * the second was served from API Gateway's cache (the Lambda was not
 * re-invoked).
 *
 * NOTE: this file is .js (CommonJS) intentionally. Lambda's nodejs20.x
 * runtime executes JS directly — there is no TypeScript transpiler in
 * the deploy package. The fixture intentionally avoids serverless-esbuild
 * to keep the test surface minimal. The "TypeScript everywhere" rule
 * applies to source authored for our packages; runtime entry points
 * deployed to AWS are an explicit exception.
 */

'use strict';

exports.hello = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Source': 'lambda-invocation',
    },
    body: JSON.stringify({
      message: 'hello from interlace e2e fixture',
      generatedAt: Date.now(),
      pid: process.pid,
    }),
  };
};
