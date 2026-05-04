import type {
  IamStatement,
  ServerlessFunctionConfig,
  ServerlessStreamEvent,
} from '../framework.js';

/**
 * Build the IAM statements required for DynamoDB + Kinesis stream event sources.
 * Returns one statement per stream type that is actually used.
 *
 * Stream type detection: prefers explicit `event.stream.type`. Falls back to
 * parsing the AWS service name out of the ARN. The community plugin assumed
 * position [2] of `:`-split ARN was the service — that's correct for standard
 * ARNs (`arn:aws:dynamodb:…`) but fragile for custom partitions
 * (`arn:aws-cn:…`). We check both `[2]` and a regex fallback.
 */
export function buildStreamStatements(
  fn: ServerlessFunctionConfig,
): IamStatement[] {
  const dynamoStatement: IamStatement = {
    Effect: 'Allow',
    Action: [
      'dynamodb:GetRecords',
      'dynamodb:GetShardIterator',
      'dynamodb:DescribeStream',
      'dynamodb:ListStreams',
    ],
    Resource: [],
  };
  const kinesisStatement: IamStatement = {
    Effect: 'Allow',
    Action: [
      'kinesis:GetRecords',
      'kinesis:GetShardIterator',
      'kinesis:DescribeStream',
      'kinesis:ListStreams',
    ],
    Resource: [],
  };

  for (const event of fn.events ?? []) {
    if (!event.stream) continue;
    const streamArn = extractStreamArn(event.stream);
    if (streamArn === undefined) continue;
    const streamType = detectStreamType(event.stream, streamArn);
    if (streamType === 'dynamodb') {
      pushResource(dynamoStatement, streamArn);
    } else if (streamType === 'kinesis') {
      pushResource(kinesisStatement, streamArn);
    } else {
      throw new Error(
        `Unsupported stream type "${String(streamType)}" for function "${fn.name ?? 'unknown'}"`,
      );
    }
  }

  const out: IamStatement[] = [];
  if ((dynamoStatement.Resource as unknown[]).length > 0)
    out.push(dynamoStatement);
  if ((kinesisStatement.Resource as unknown[]).length > 0)
    out.push(kinesisStatement);
  return out;
}

function extractStreamArn(
  stream: ServerlessStreamEvent | string,
): string | Record<string, unknown> | undefined {
  if (typeof stream === 'string') return stream;
  return stream.arn ?? undefined;
}

function detectStreamType(
  stream: ServerlessStreamEvent | string,
  arn: string | Record<string, unknown>,
): 'dynamodb' | 'kinesis' | 'unknown' {
  if (typeof stream === 'object' && stream.type) return stream.type;
  if (typeof arn !== 'string') return 'unknown';
  const parts = arn.split(':');
  if (parts.length < 3) return 'unknown';
  const service = parts[2].toLowerCase();
  if (service === 'dynamodb') return 'dynamodb';
  if (service === 'kinesis') return 'kinesis';
  return 'unknown';
}

function pushResource(
  statement: IamStatement,
  arn: string | Record<string, unknown>,
): void {
  (statement.Resource as Array<string | Record<string, unknown>>).push(arn);
}
