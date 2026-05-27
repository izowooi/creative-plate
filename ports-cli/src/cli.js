import packageJson from '../package.json' with { type: 'json' };
import { parseArgs, renderHelp } from './args.js';
import { summarizeListeners } from './listeners.js';
import { collectLsofOutput, parseLsofFieldOutput } from './lsof.js';
import { collectProcessCommandLines } from './processes.js';
import { renderTable } from './render.js';

export async function run(argv = process.argv.slice(2), io = process) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${error.message}\n\n${renderHelp()}\n`);
    return 2;
  }

  if (options.help) {
    io.stdout.write(`${renderHelp()}\n`);
    return 0;
  }

  if (options.version) {
    io.stdout.write(`${packageJson.version}\n`);
    return 0;
  }

  try {
    const [lsofOutput, commandLines] = await Promise.all([
      collectLsofOutput(),
      collectProcessCommandLines()
    ]);
    const listeners = summarizeListeners(parseLsofFieldOutput(lsofOutput), commandLines);

    if (options.json) {
      io.stdout.write(`${JSON.stringify(listeners, null, 2)}\n`);
      return 0;
    }

    io.stdout.write(
      `${renderTable(listeners, {
        color: shouldUseColor(options.color, io.stdout),
        wide: options.wide,
        width: io.stdout.columns || 100
      })}\n`
    );
    return 0;
  } catch (error) {
    io.stderr.write(`ports: ${error.message}\n`);
    return 1;
  }
}

function shouldUseColor(color, stdout) {
  if (color === 'always') {
    return true;
  }
  if (color === 'never') {
    return false;
  }
  return Boolean(stdout.isTTY) && !process.env.NO_COLOR;
}
