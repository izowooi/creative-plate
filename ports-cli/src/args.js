export function parseArgs(argv) {
  const options = {
    color: 'auto',
    help: false,
    json: false,
    version: false,
    wide: false
  };

  for (const arg of argv) {
    switch (arg) {
      case '--json':
        options.json = true;
        break;
      case '--wide':
      case '-w':
        options.wide = true;
        break;
      case '--no-color':
        options.color = 'never';
        break;
      case '--color':
        options.color = 'always';
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-v':
        options.version = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function renderHelp() {
  return [
    'ports - show listening TCP ports on macOS',
    '',
    'Usage:',
    '  ports [options]',
    '',
    'Options:',
    '  --json        Print machine-readable JSON',
    '  -w, --wide    Include full process command lines',
    '  --color       Always use ANSI color',
    '  --no-color    Disable ANSI color',
    '  -h, --help    Show this help',
    '  -v, --version Show the CLI version'
  ].join('\n');
}
