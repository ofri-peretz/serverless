import type { AwsProvider, IamStatement } from '../framework.js';

/**
 * Standard CloudWatch Logs statement — always added to every per-function role.
 * Scoped to the function's specific log group, not `*`, so the role can't
 * write to log groups it doesn't own.
 */
export function buildLogStatement(
  provider: AwsProvider,
  functionName: string,
): IamStatement {
  return {
    Effect: 'Allow',
    Action: [
      'logs:CreateLogStream',
      'logs:CreateLogGroup',
      'logs:PutLogEvents',
    ],
    Resource: [
      {
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${provider.naming.getLogGroupName(functionName)}:*:*`,
      },
    ],
  };
}
