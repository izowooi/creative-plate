import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProcessCommandLines } from '../src/processes.js';

test('parseProcessCommandLines maps ps output to pid command pairs', () => {
  const commands = parseProcessCommandLines([
    '    123 node server.js --host 127.0.0.1',
    '   456 /usr/bin/python3 -m http.server 8000',
    ''
  ].join('\n'));

  assert.deepEqual(commands, new Map([
    [123, 'node server.js --host 127.0.0.1'],
    [456, '/usr/bin/python3 -m http.server 8000']
  ]));
});
