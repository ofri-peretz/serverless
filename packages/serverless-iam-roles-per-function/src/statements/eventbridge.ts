import type { IamStatement, ServerlessFunctionConfig } from '../framework.js';

/**
 * EventBridge auto-permissions — NOT covered by the community plugin.
 *
 * When a function publishes to EventBridge (via the AWS SDK from inside the
 * Lambda), it needs `events:PutEvents` on the target event bus. The
 * Serverless Framework's `eventBridge` event source itself does not require
 * publish permissions (EventBridge invokes the Lambda, not the other way
 * round) — but functions that USE EventBridge as a destination, fan-out
 * coordinator, or scheduler-target need the permission.
 *
 * This helper looks for an `eventBridge` event with an explicit `eventBus`
 * (string or CFN intrinsic) and emits the corresponding publish permission.
 * If no event bus is specified, no statement is emitted (no opinionated
 * default — users can add it manually via `iamRoleStatements` if needed).
 */
export function buildEventBridgeStatements(
  fn: ServerlessFunctionConfig,
): IamStatement[] {
  const buses: Array<string | Record<string, unknown>> = [];
  for (const event of fn.events ?? []) {
    if (!event.eventBridge) continue;
    if (event.eventBridge.eventBus) buses.push(event.eventBridge.eventBus);
  }
  if (buses.length === 0) return [];

  return [
    {
      Effect: 'Allow',
      Action: ['events:PutEvents'],
      Resource: buses,
    },
  ];
}
