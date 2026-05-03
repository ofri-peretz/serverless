import { describe, it, expect } from 'vitest';
import { defineConfig, defineFunction, defineFunctions } from './index.js';

describe('defineConfig', () => {
  it('returns the config object unchanged (identity function)', () => {
    const config = {
      service: 'test-service',
      provider: {
        name: 'aws' as const,
        runtime: 'nodejs20.x',
        region: 'us-east-1',
      },
    };

    const result = defineConfig(config);
    expect(result).toBe(config);
    expect(result.service).toBe('test-service');
    expect(result.provider.name).toBe('aws');
  });

  it('accepts full configuration with functions and events', () => {
    const config = defineConfig({
      service: 'full-service',
      provider: {
        name: 'aws',
        runtime: 'nodejs20.x',
        region: 'eu-west-1',
        stage: 'production',
        memorySize: 256,
        timeout: 30,
        architecture: 'arm64',
        environment: {
          TABLE_NAME: 'users',
        },
        tags: {
          project: 'interlace',
        },
        iam: {
          role: {
            statements: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
                Resource: 'arn:aws:dynamodb:*:*:table/users',
              },
            ],
          },
        },
        tracing: {
          lambda: true,
          apiGateway: true,
        },
      },
      build: {
        esbuild: {
          bundle: true,
          minify: true,
          sourcemap: true,
          external: ['@aws-sdk/*'],
        },
      },
      functions: {
        getUser: {
          handler: 'src/handlers/user.get',
          memorySize: 512,
          events: [
            {
              http: {
                path: '/users/{id}',
                method: 'get',
                cors: true,
              },
            },
          ],
        },
        createUser: {
          handler: 'src/handlers/user.create',
          events: [
            {
              http: {
                path: '/users',
                method: 'post',
                cors: {
                  origin: '*',
                  headers: ['Content-Type', 'Authorization'],
                  allowCredentials: true,
                },
              },
            },
          ],
        },
        processQueue: {
          handler: 'src/handlers/queue.process',
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:us-east-1:123456789:my-queue',
                batchSize: 10,
                functionResponseType: 'ReportBatchItemFailures',
              },
            },
          ],
        },
      },
      plugins: ['@interlace/serverless-api-gateway-caching'],
      custom: {
        interlaceCaching: {
          enabled: true,
          clusterSize: '0.5',
        },
      },
      resources: {
        Resources: {
          UsersTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'users',
              AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
              KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
              BillingMode: 'PAY_PER_REQUEST',
            },
          },
        },
        Outputs: {
          UsersTableArn: {
            Description: 'Users table ARN',
            Value: { 'Fn::GetAtt': ['UsersTable', 'Arn'] },
            Export: { Name: 'users-table-arn' },
          },
        },
      },
    });

    expect(config.service).toBe('full-service');
    expect(config.provider.architecture).toBe('arm64');
    expect(config.functions?.getUser.handler).toBe('src/handlers/user.get');
    expect(config.build?.esbuild).not.toBe(false);
    expect(config.resources?.Resources?.UsersTable.Type).toBe('AWS::DynamoDB::Table');
  });

  it('accepts minimal configuration', () => {
    const config = defineConfig({
      service: 'minimal',
      provider: { name: 'aws' },
    });

    expect(config.service).toBe('minimal');
    expect(config.functions).toBeUndefined();
  });
});

describe('defineFunction', () => {
  it('returns the function config unchanged', () => {
    const fn = defineFunction({
      handler: 'src/handler.hello',
      memorySize: 256,
      timeout: 10,
    });

    expect(fn.handler).toBe('src/handler.hello');
    expect(fn.memorySize).toBe(256);
  });
});

describe('defineFunctions', () => {
  it('returns the functions map unchanged', () => {
    const fns = defineFunctions({
      hello: { handler: 'src/handler.hello' },
      world: { handler: 'src/handler.world', timeout: 30 },
    });

    expect(Object.keys(fns)).toHaveLength(2);
    expect(fns.hello.handler).toBe('src/handler.hello');
    expect(fns.world.timeout).toBe(30);
  });
});
