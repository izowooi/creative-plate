import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../src/args.js';

test('parseArgs keeps the default output human readable', () => {
  assert.deepEqual(parseArgs([]), {
    color: 'auto',
    help: false,
    json: false,
    version: false,
    wide: false
  });
});

test('parseArgs supports json, wide, no-color, help, and version', () => {
  assert.deepEqual(parseArgs(['--json', '--wide', '--no-color', '--help', '--version']), {
    color: 'never',
    help: true,
    json: true,
    version: true,
    wide: true
  });
});

test('parseArgs rejects unknown flags', () => {
  assert.throws(() => parseArgs(['--wat']), /Unknown option: --wat/);
});
