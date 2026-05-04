import { describe, expect, it } from 'vitest';
import { buildEventBridgeStatements } from './eventbridge.js';

describe('buildEventBridgeStatements — eventBus coercion', () => {
  it('returns an empty list when no eventBridge events are present', () => {
    expect(buildEventBridgeStatements({ handler: 'h.x' })).toEqual([]);
  });

  it('returns an empty list when eventBridge has no eventBus', () => {
    expect(
      buildEventBridgeStatements({
        handler: 'h.x',
        events: [{ eventBridge: { schedule: 'rate(1 hour)' } }],
      }),
    ).toEqual([]);
  });

  it('coerces a bare bus name (incl. "default") to a partition-aware Fn::Sub ARN', () => {
    const statements = buildEventBridgeStatements({
      handler: 'h.x',
      events: [{ eventBridge: { eventBus: 'default' } }],
    });
    expect(statements).toEqual([
      {
        Effect: 'Allow',
        Action: ['events:PutEvents'],
        Resource: [
          {
            'Fn::Sub':
              'arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:event-bus/default',
          },
        ],
      },
    ]);
  });

  it('coerces a custom bus name', () => {
    const statements = buildEventBridgeStatements({
      handler: 'h.x',
      events: [{ eventBridge: { eventBus: 'my-bus' } }],
    });
    expect(statements[0].Resource).toEqual([
      {
        'Fn::Sub':
          'arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:event-bus/my-bus',
      },
    ]);
  });

  it('passes through a full ARN string unchanged', () => {
    const arn = 'arn:aws:events:us-east-1:123456789012:event-bus/prod';
    const statements = buildEventBridgeStatements({
      handler: 'h.x',
      events: [{ eventBridge: { eventBus: arn } }],
    });
    expect(statements[0].Resource).toEqual([arn]);
  });

  it('passes through a CFN intrinsic (Ref / Fn::GetAtt) unchanged', () => {
    const intrinsic = { 'Fn::GetAtt': ['MyBus', 'Arn'] };
    const statements = buildEventBridgeStatements({
      handler: 'h.x',
      events: [{ eventBridge: { eventBus: intrinsic } }],
    });
    expect(statements[0].Resource).toEqual([intrinsic]);
  });
});
