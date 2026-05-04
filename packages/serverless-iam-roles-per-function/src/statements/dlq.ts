import type { IamStatement, ServerlessFunctionConfig } from '../framework.js';

/**
 * Lambda functions can declare an SNS topic as their dead-letter destination
 * via `onError: <arn>`. The function's role needs `sns:Publish` on that topic.
 *
 * AWS docs: https://www.serverless.com/framework/docs/providers/aws/events/sns#dlq-with-sqs
 *
 * Returns null when no `onError` is configured.
 */
export function buildDlqStatement(
  fn: ServerlessFunctionConfig,
): IamStatement | null {
  if (!fn.onError) return null;
  return {
    Effect: 'Allow',
    Action: ['sns:Publish'],
    Resource: fn.onError as string | Record<string, unknown>,
  };
}
