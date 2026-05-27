import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function collectProcessCommandLines() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,command=']);
  return parseProcessCommandLines(stdout);
}

export function parseProcessCommandLines(output) {
  const commands = new Map();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (match) {
      commands.set(Number(match[1]), match[2].trim());
    }
  }

  return commands;
}
