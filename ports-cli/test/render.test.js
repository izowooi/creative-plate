import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTable } from '../src/render.js';

test('renderTable prints a compact glanceable table', () => {
  const output = renderTable(
    [
      {
        command: 'node',
        commandLine: 'node server.js --host 0.0.0.0',
        hosts: ['0.0.0.0', '[::]'],
        pid: 123,
        port: 5173,
        scope: 'all',
        url: 'http://localhost:5173',
        user: 'developer'
      },
      {
        command: 'Python',
        commandLine: 'python3 -m http.server 8000',
        hosts: ['127.0.0.1'],
        pid: 456,
        port: 8000,
        scope: 'local',
        url: 'http://localhost:8000',
        user: 'developer'
      }
    ],
    { color: false, width: 120 }
  );

  assert.match(output, /^PORT\s+SCOPE\s+ADDRESS\s+PID\s+PROCESS\s+URL/m);
  assert.match(output, /5173\s+all\s+0\.0\.0\.0, \[::\]\s+123\s+node\s+http:\/\/localhost:5173/);
  assert.match(output, /8000\s+local\s+127\.0\.0\.1\s+456\s+Python\s+http:\/\/localhost:8000/);
});

test('renderTable explains when no listeners are found', () => {
  assert.equal(
    renderTable([], { color: false, width: 80 }),
    'No listening TCP ports found.'
  );
});
