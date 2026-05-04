import type {
  IamStatement,
  ServerlessFunctionConfig,
  ServerlessSqsEvent,
} from '../framework.js';

/**
 * If the function has SQS event sources, return the statement granting the
 * receive/delete/get-attributes triple AWS requires for Lambda+SQS integration.
 * Returns null when no SQS events are present.
 */
export function buildSqsStatement(
  fn: ServerlessFunctionConfig,
): IamStatement | null {
  const resources: Array<string | Record<string, unknown>> = [];
  for (const event of fn.events ?? []) {
    if (!event.sqs) continue;
    const sqsArn = extractArn(event.sqs);
    if (sqsArn !== undefined) resources.push(sqsArn);
  }
  if (resources.length === 0) return null;

  return {
    Effect: 'Allow',
    Action: [
      'sqs:ReceiveMessage',
      'sqs:DeleteMessage',
      'sqs:GetQueueAttributes',
    ],
    Resource: resources,
  };
}

function extractArn(
  sqsEvent: ServerlessSqsEvent | string,
): string | Record<string, unknown> | undefined {
  if (typeof sqsEvent === 'string') return sqsEvent;
  return sqsEvent.arn ?? undefined;
}
