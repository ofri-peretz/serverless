/**
 * VPC managed-policy ARN. When a function (or the provider) declares VPC
 * config, the function's role needs `AWSLambdaVPCAccessExecutionRole` to
 * create/describe ENIs.
 *
 * We attach this as a managed-policy ARN rather than inlining the
 * statements — matches the AWS-recommended pattern and keeps the role's
 * inline policies focused on caller-provided permissions.
 */
export const VPC_MANAGED_POLICY_ARN: Record<string, unknown> = {
  'Fn::Join': [
    '',
    [
      'arn:',
      { Ref: 'AWS::Partition' },
      ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
    ],
  ],
};
