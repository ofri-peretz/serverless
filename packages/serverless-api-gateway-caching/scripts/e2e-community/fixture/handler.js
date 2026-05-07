'use strict';

exports.hello = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'X-E2E-Source': 'lambda-invocation',
    'X-E2E-Plugin': 'community',
  },
  body: JSON.stringify({
    message: 'hello from community fixture',
    generatedAt: Date.now(),
    pid: process.pid,
  }),
});
