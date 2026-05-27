import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function collectLsofOutput() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', [
      '-nP',
      '-iTCP',
      '-sTCP:LISTEN',
      '-F',
      'pcuLnT'
    ]);
    return stdout;
  } catch (error) {
    if (error.code === 1 && typeof error.stdout === 'string') {
      return error.stdout;
    }
    throw error;
  }
}

export function parseLsofFieldOutput(output) {
  const records = [];
  let process = null;
  let file = null;

  const commitFile = () => {
    if (!process || !file || !file.name) {
      return;
    }

    const endpoint = parseEndpoint(file.name);
    if (!endpoint || endpoint.protocol === 'UDP') {
      return;
    }

    const state = file.state || 'LISTEN';
    if (state !== 'LISTEN') {
      return;
    }

    records.push({
      command: process.command,
      host: endpoint.host,
      pid: process.pid,
      port: endpoint.port,
      state,
      uid: process.uid,
      user: process.user
    });
  };

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine) {
      continue;
    }

    const field = rawLine[0];
    const value = rawLine.slice(1);

    if (field === 'p') {
      commitFile();
      process = {
        command: '',
        pid: Number(value),
        uid: '',
        user: ''
      };
      file = null;
      continue;
    }

    if (!process) {
      continue;
    }

    if (field === 'f') {
      commitFile();
      file = { name: '', state: '' };
      continue;
    }

    if (field === 'c') {
      process.command = value;
      continue;
    }

    if (field === 'u') {
      process.uid = value;
      continue;
    }

    if (field === 'L') {
      process.user = value;
      continue;
    }

    if (!file) {
      continue;
    }

    if (field === 'n') {
      file.name = value;
      continue;
    }

    if (field === 'T' && value.startsWith('ST=')) {
      file.state = value.slice(3);
    }
  }

  commitFile();
  return records;
}

export function parseEndpoint(name) {
  const match = name.match(/^(.*):(\d+)(?:\s|$)/);
  if (!match) {
    return null;
  }

  return {
    host: match[1] || '*',
    port: Number(match[2]),
    protocol: 'TCP'
  };
}
