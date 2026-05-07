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
 *
 * `eventBus` accepts three shapes per the framework's schema:
 *   - bare bus name (e.g. `'default'`, `'my-bus'`) — coerced to a full ARN
 *     via `Fn::Sub` so IAM accepts it as a Resource value.
 *   - full ARN string (`'arn:aws:events:...'`) — passed through unchanged.
 *   - CFN intrinsic (`{ Ref: '...' }`, `{ 'Fn::GetAtt': [...] }`) — passed
 *     through unchanged; CFN resolves it during deploy.
 */
export function buildEventBridgeStatements(
  fn: ServerlessFunctionConfig,
): IamStatement[] {
  const buses: Array<string | Record<string, unknown>> = [];
  for (const event of fn.events ?? []) {
    if (!event.eventBridge) continue;
    if (event.eventBridge.eventBus) {
      buses.push(coerceEventBusToArn(event.eventBridge.eventBus));
    }
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

function coerceEventBusToArn(
  bus: string | Record<string, unknown>,
): string | Record<string, unknown> {
  if (typeof bus !== 'string') return bus;
  if (bus.startsWith('arn:')) return bus;
  // Bus name (incl. 'default') → expand to a partition/region/account-aware ARN.
  // The escaped `${...}` survives JS string parsing as literal text and CFN
  // resolves it at deploy time.
  return {
    'Fn::Sub': `arn:\${AWS::Partition}:events:\${AWS::Region}:\${AWS::AccountId}:event-bus/${bus}`,
  };
}
