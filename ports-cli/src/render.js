const RESET = '\u001B[0m';
const DIM = '\u001B[2m';
const BOLD = '\u001B[1m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const CYAN = '\u001B[36m';

export function renderTable(listeners, options = {}) {
  const color = options.color === true;
  const width = options.width || 100;
  const wide = options.wide === true;

  if (listeners.length === 0) {
    return 'No listening TCP ports found.';
  }

  const rows = listeners.map((listener) => ({
    address: listener.hosts.join(', '),
    pid: String(listener.pid),
    port: String(listener.port),
    process: wide ? listener.commandLine : listener.command,
    scope: listener.scope,
    url: listener.url
  }));

  const columns = [
    { key: 'port', label: 'PORT', min: 4 },
    { key: 'scope', label: 'SCOPE', min: 5 },
    { key: 'address', label: 'ADDRESS', min: 7 },
    { key: 'pid', label: 'PID', min: 3 },
    { key: 'process', label: 'PROCESS', min: 7 },
    { key: 'url', label: 'URL', min: 3 }
  ];

  const widths = computeWidths(columns, rows, width);
  const header = columns
    .map((column) => pad(column.label, widths[column.key]))
    .join('  ')
    .trimEnd();

  const lines = [color ? paint(header, BOLD) : header];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = truncate(row[column.key], widths[column.key]);
          const padded = pad(value, widths[column.key]);
          return colorizeCell(column.key, value, padded, color);
        })
        .join('  ')
        .trimEnd()
    );
  }

  return lines.join('\n');
}

function computeWidths(columns, rows, terminalWidth) {
  const fixedKeys = new Set(['port', 'scope', 'pid', 'url']);
  const widths = {};

  for (const column of columns) {
    const contentWidth = Math.max(
      column.label.length,
      column.min,
      ...rows.map((row) => String(row[column.key]).length)
    );
    widths[column.key] = contentWidth;
  }

  const separatorWidth = (columns.length - 1) * 2;
  const totalWidth = Object.values(widths).reduce((sum, value) => sum + value, 0) + separatorWidth;

  if (totalWidth <= terminalWidth) {
    return widths;
  }

  let overflow = totalWidth - terminalWidth;
  for (const key of ['process', 'address']) {
    const floor = key === 'process' ? 18 : 10;
    const reduction = Math.min(overflow, Math.max(0, widths[key] - floor));
    widths[key] -= reduction;
    overflow -= reduction;
  }

  for (const column of columns) {
    if (!fixedKeys.has(column.key)) {
      widths[column.key] = Math.max(column.min, widths[column.key]);
    }
  }

  return widths;
}

function colorizeCell(key, value, padded, color) {
  if (!color) {
    return padded;
  }

  if (key === 'port') {
    return paint(padded, CYAN);
  }

  if (key === 'scope') {
    const colorCode = value === 'local' ? GREEN : value === 'all' ? YELLOW : CYAN;
    return paint(padded, colorCode);
  }

  if (key === 'pid') {
    return paint(padded, DIM);
  }

  return padded;
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function truncate(value, width) {
  const text = String(value);
  if (text.length <= width) {
    return text;
  }
  if (width <= 1) {
    return text.slice(0, width);
  }
  if (width <= 3) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function paint(text, color) {
  return `${color}${text}${RESET}`;
}
