const ALL_INTERFACE_HOSTS = new Set(['*', '0.0.0.0', '[::]', '::']);
const LOCAL_HOST_PATTERN = /^(127\.|localhost$|\[::1\]$|::1$)/;

export function summarizeListeners(records, commandLines = new Map()) {
  const grouped = new Map();

  for (const record of records) {
    if (!Number.isInteger(record.port) || !Number.isInteger(record.pid)) {
      continue;
    }

    const key = `${record.port}:${record.pid}:${record.command}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.hosts.add(record.host);
      continue;
    }

    grouped.set(key, {
      command: record.command,
      commandLine: commandLines.get(record.pid) || record.command,
      hosts: new Set([record.host]),
      pid: record.pid,
      port: record.port,
      user: record.user
    });
  }

  return [...grouped.values()]
    .map((listener) => {
      const hosts = [...listener.hosts].sort(compareHosts);

      return {
        command: listener.command,
        commandLine: listener.commandLine,
        hosts,
        pid: listener.pid,
        port: listener.port,
        scope: classifyScope(hosts),
        url: makeLocalUrl(listener.port),
        user: listener.user
      };
    })
    .sort((left, right) => left.port - right.port || left.pid - right.pid);
}

export function classifyScope(hosts) {
  if (hosts.some((host) => ALL_INTERFACE_HOSTS.has(host))) {
    return 'all';
  }

  if (hosts.every((host) => LOCAL_HOST_PATTERN.test(host))) {
    return 'local';
  }

  return 'network';
}

function makeLocalUrl(port) {
  return `http://localhost:${port}`;
}

function compareHosts(left, right) {
  return hostRank(left) - hostRank(right) || left.localeCompare(right);
}

function hostRank(host) {
  if (host === '*' || host === '0.0.0.0') {
    return 0;
  }
  if (host === '[::]' || host === '::') {
    return 1;
  }
  if (LOCAL_HOST_PATTERN.test(host)) {
    return 2;
  }
  return 3;
}
