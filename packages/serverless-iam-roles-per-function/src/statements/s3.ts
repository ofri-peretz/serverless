import type {
  IamStatement,
  ServerlessFunctionConfig,
  ServerlessS3Event,
} from '../framework.js';

/**
 * S3 event-source auto-permissions — NOT covered by the community plugin.
 *
 * When a function is triggered by S3 events, it typically needs to read
 * the object that triggered it. We grant `s3:GetObject` scoped to the
 * specific bucket(s) the function listens to.
 *
 * Note: writes (`PutObject`, `DeleteObject`) are NOT auto-granted — most
 * S3-event handlers should be read-only by default. Users that need write
 * access add explicit `iamRoleStatements`.
 *
 * Returns an empty array when no S3 event sources are present.
 */
export function buildS3Statements(
  fn: ServerlessFunctionConfig,
): IamStatement[] {
  const buckets: Array<string | Record<string, unknown>> = [];
  for (const event of fn.events ?? []) {
    if (!event.s3) continue;
    const bucket = extractBucket(event.s3);
    if (bucket === undefined) continue;
    buckets.push(buildBucketObjectArn(bucket));
  }
  if (buckets.length === 0) return [];

  return [
    {
      Effect: 'Allow',
      Action: ['s3:GetObject'],
      Resource: buckets,
    },
  ];
}

function extractBucket(
  s3Event: ServerlessS3Event | string,
): string | Record<string, unknown> | undefined {
  if (typeof s3Event === 'string') return s3Event;
  return s3Event.bucket ?? undefined;
}

/**
 * `s3:GetObject` is scoped to OBJECTS, not the bucket itself: the resource
 * ARN must include `/*`. We build a `Fn::Sub` that produces the right
 * `arn:aws:s3:::<bucket>/*` regardless of partition.
 */
function buildBucketObjectArn(
  bucket: string | Record<string, unknown>,
): string | Record<string, unknown> {
  if (typeof bucket === 'string') {
    return {
      'Fn::Sub': `arn:\${AWS::Partition}:s3:::${bucket}/*`,
    };
  }
  // CFN intrinsic — preserve as-is and append `/*` via Fn::Sub
  return {
    'Fn::Join': ['', [bucket, '/*']],
  };
}
