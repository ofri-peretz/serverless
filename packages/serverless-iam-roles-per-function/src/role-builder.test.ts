/**
 * Regression tests for the role-builder bugs found in the v1.0.0 review.
 *
 * Bug 1 (BLOCKER): EventSourceMapping → role lookup used a prefix heuristic
 *   that mis-attributed roles when two function names share a prefix.
 *
 * Bug 2 (SERIOUS): cloned global role's `Policies[1..n]` were preserved on
 *   every per-function role, leaking unrelated inline policies.
 */

import { describe, expect, it } from 'vitest';
import { applyPerFunctionRoles } from './role-builder.js';
import type {
  AwsProvider,
  CloudFormationResource,
  CompiledCloudFormationTemplate,
  IamRoleProperties,
  ServerlessFunctionConfig,
  ServerlessInstance,
} from './framework.js';
import type { ResolvedSettings } from './types.js';

const DEFAULT_SETTINGS: ResolvedSettings = {
  global: {
    defaultInherit: false,
    suppressGlobalRole: false,
    requirePerFunctionRoles: false,
    consolidateIdenticalRoles: false,
    statementTemplates: {},
  },
};

function makeNaming(): AwsProvider['naming'] {
  // Mirrors the framework's transform: `myFn` → `MyFn`.
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    getRoleLogicalId: () => 'IamRoleLambdaExecution',
    getNormalizedFunctionName: (n: string) => cap(n),
    getLambdaLogicalId: (n: string) => `${cap(n)}LambdaFunction`,
    getLogGroupName: (n: string) => `/aws/lambda/svc-stage-${n}`,
    getStackName: () => 'svc-stage',
    getRoleName: () => ({
      'Fn::Join': [
        '-',
        [{ Ref: 'ServiceName' }, 'stage', 'us-east-1', 'lambdaRole'],
      ],
    }),
  } as AwsProvider['naming'];
}

interface MakeServerlessOpts {
  functions: Record<string, ServerlessFunctionConfig>;
  globalRole?: CloudFormationResource;
  extraResources?: Record<string, CloudFormationResource>;
}

function makeServerless({
  functions,
  globalRole,
  extraResources = {},
}: MakeServerlessOpts): {
  serverless: ServerlessInstance;
  provider: AwsProvider;
  template: CompiledCloudFormationTemplate;
} {
  const naming = makeNaming();
  const Resources: Record<string, CloudFormationResource> = {
    IamRoleLambdaExecution: globalRole ?? {
      Type: 'AWS::IAM::Role',
      Properties: {
        RoleName: 'svc-stage-region-lambdaRole',
        AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [] },
        Policies: [
          {
            PolicyName: 'svc-stage-lambda',
            PolicyDocument: { Version: '2012-10-17', Statement: [] },
          },
        ],
        ManagedPolicyArns: [],
      } as IamRoleProperties,
    },
    ...extraResources,
  };
  for (const fnName of Object.keys(functions)) {
    Resources[naming.getLambdaLogicalId(fnName)] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
      },
    };
  }
  const template: CompiledCloudFormationTemplate = { Resources };
  const provider = {
    naming,
    getStage: () => 'stage',
    getRegion: () => 'us-east-1',
  } as unknown as AwsProvider;

  const serverless: ServerlessInstance = {
    service: {
      service: 'svc',
      provider: {
        name: 'aws',
        compiledCloudFormationTemplate: template,
      },
      functions,
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name: string) =>
        ({ ...functions[name], name }) as ServerlessFunctionConfig & {
          name: string;
        },
    },
    providers: { aws: provider },
    cli: { log: () => undefined },
  } as unknown as ServerlessInstance;

  return { serverless, provider, template };
}

describe('role-builder — Bug 1 (lookupByLogicalId prefix collision)', () => {
  it('assigns the right role to each EventSourceMapping when two function names share a prefix', () => {
    const fn: ServerlessFunctionConfig = {
      handler: 'h.fn',
      iamRoleStatements: [
        { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
      ],
      events: [{ sqs: { arn: 'arn:aws:sqs:us-east-1:111:fn-q' } }],
    };
    const fnExtra: ServerlessFunctionConfig = {
      handler: 'h.fnExtra',
      iamRoleStatements: [
        { Effect: 'Allow', Action: ['s3:PutObject'], Resource: '*' },
      ],
      events: [{ sqs: { arn: 'arn:aws:sqs:us-east-1:111:fnExtra-q' } }],
    };
    const { serverless, provider, template } = makeServerless({
      functions: { fn, fnExtra },
      extraResources: {
        FnEventSourceMapping: {
          Type: 'AWS::Lambda::EventSourceMapping',
          Properties: {
            FunctionName: { 'Fn::GetAtt': ['FnLambdaFunction', 'Arn'] },
            EventSourceArn: 'arn:aws:sqs:us-east-1:111:fn-q',
          },
        },
        FnExtraEventSourceMapping: {
          Type: 'AWS::Lambda::EventSourceMapping',
          Properties: {
            FunctionName: { 'Fn::GetAtt': ['FnExtraLambdaFunction', 'Arn'] },
            EventSourceArn: 'arn:aws:sqs:us-east-1:111:fnExtra-q',
          },
        },
      },
    });

    applyPerFunctionRoles({ serverless, provider, settings: DEFAULT_SETTINGS });

    expect(template.Resources.FnEventSourceMapping?.DependsOn).toBe(
      'FnIamRoleLambdaExecution',
    );
    expect(template.Resources.FnExtraEventSourceMapping?.DependsOn).toBe(
      'FnExtraIamRoleLambdaExecution',
    );
  });

  it('handles the reverse insertion order (longer-name function declared first)', () => {
    // Same scenario, opposite Map insertion order. The pre-fix heuristic
    // was order-dependent; the fix should be order-independent.
    const fnExtra: ServerlessFunctionConfig = {
      handler: 'h.fnExtra',
      iamRoleStatements: [
        { Effect: 'Allow', Action: ['s3:PutObject'], Resource: '*' },
      ],
      events: [{ sqs: { arn: 'arn:aws:sqs:us-east-1:111:fnExtra-q' } }],
    };
    const fn: ServerlessFunctionConfig = {
      handler: 'h.fn',
      iamRoleStatements: [
        { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
      ],
      events: [{ sqs: { arn: 'arn:aws:sqs:us-east-1:111:fn-q' } }],
    };
    const { serverless, provider, template } = makeServerless({
      functions: { fnExtra, fn },
      extraResources: {
        FnEsm: {
          Type: 'AWS::Lambda::EventSourceMapping',
          Properties: {
            FunctionName: { 'Fn::GetAtt': ['FnLambdaFunction', 'Arn'] },
            EventSourceArn: 'arn:aws:sqs:us-east-1:111:fn-q',
          },
        },
        FnExtraEsm: {
          Type: 'AWS::Lambda::EventSourceMapping',
          Properties: {
            FunctionName: { 'Fn::GetAtt': ['FnExtraLambdaFunction', 'Arn'] },
            EventSourceArn: 'arn:aws:sqs:us-east-1:111:fnExtra-q',
          },
        },
      },
    });

    applyPerFunctionRoles({ serverless, provider, settings: DEFAULT_SETTINGS });

    expect(template.Resources.FnEsm?.DependsOn).toBe(
      'FnIamRoleLambdaExecution',
    );
    expect(template.Resources.FnExtraEsm?.DependsOn).toBe(
      'FnExtraIamRoleLambdaExecution',
    );
  });
});

describe('role-builder — Bug 2 (Policies array leak)', () => {
  it('does not propagate Policies[1..n] from the global role to per-function roles', () => {
    const fn: ServerlessFunctionConfig = {
      handler: 'h.fn',
      iamRoleStatements: [
        { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
      ],
    };
    // Simulate a third-party plugin that appends a second inline policy to
    // the global role. This must NOT appear on per-function roles.
    const globalRole: CloudFormationResource = {
      Type: 'AWS::IAM::Role',
      Properties: {
        RoleName: 'svc-stage-region-lambdaRole',
        AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [] },
        Policies: [
          {
            PolicyName: 'svc-stage-lambda',
            PolicyDocument: { Version: '2012-10-17', Statement: [] },
          },
          {
            // A leaked extra inline policy.
            PolicyName: 'extraneous-vpc-flow-logs',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['logs:CreateLogGroup'],
                  Resource: 'arn:aws:logs:*:*:log-group:/vpc/flow/*',
                },
              ],
            },
          },
        ],
        ManagedPolicyArns: [],
      } as IamRoleProperties,
    };
    const { serverless, provider, template } = makeServerless({
      functions: { fn },
      globalRole,
    });

    applyPerFunctionRoles({ serverless, provider, settings: DEFAULT_SETTINGS });

    const perFunctionRole = template.Resources.FnIamRoleLambdaExecution as
      | { Properties: IamRoleProperties }
      | undefined;
    expect(perFunctionRole).toBeDefined();
    const policies = perFunctionRole?.Properties.Policies;
    expect(policies?.length).toBe(1);
    expect((policies?.[0] as { PolicyName?: string }).PolicyName).toBe(
      'iam-roles-per-function-inline',
    );
  });
});
