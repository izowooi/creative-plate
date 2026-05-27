import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLsofFieldOutput } from '../src/lsof.js';
import { summarizeListeners } from '../src/listeners.js';

test('parseLsofFieldOutput reads macOS lsof field output', () => {
  const output = [
    'p123',
    'cnode',
    'u501',
    'Ldeveloper',
    'f10',
    'n127.0.0.1:3000',
    'TST=LISTEN',
    'f11',
    'n[::1]:3000',
    'TST=LISTEN',
    'p456',
    'cPython',
    'u501',
    'Ldeveloper',
    'f4',
    'n*:8000',
    'TST=LISTEN',
    'f5',
    'n127.0.0.1:9000',
    'TST=CLOSE_WAIT'
  ].join('\n');

  assert.deepEqual(parseLsofFieldOutput(output), [
    {
      command: 'node',
      host: '127.0.0.1',
      pid: 123,
      port: 3000,
      state: 'LISTEN',
      uid: '501',
      user: 'developer'
    },
    {
      command: 'node',
      host: '[::1]',
      pid: 123,
      port: 3000,
      state: 'LISTEN',
      uid: '501',
      user: 'developer'
    },
    {
      command: 'Python',
      host: '*',
      pid: 456,
      port: 8000,
      state: 'LISTEN',
      uid: '501',
      user: 'developer'
    }
  ]);
});

test('summarizeListeners groups duplicate IPv4 and IPv6 sockets', () => {
  const listeners = summarizeListeners(
    [
      {
        command: 'node',
        host: '0.0.0.0',
        pid: 123,
        port: 5173,
        state: 'LISTEN',
        uid: '501',
        user: 'developer'
      },
      {
        command: 'node',
        host: '[::]',
        pid: 123,
        port: 5173,
        state: 'LISTEN',
        uid: '501',
        user: 'developer'
      },
      {
        command: 'Python',
        host: '127.0.0.1',
        pid: 456,
        port: 8000,
        state: 'LISTEN',
        uid: '501',
        user: 'developer'
      }
    ],
    new Map([
      [123, 'node server.js --host 0.0.0.0'],
      [456, 'python3 -m http.server 8000']
    ])
  );

  assert.deepEqual(listeners, [
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
  ]);
});
