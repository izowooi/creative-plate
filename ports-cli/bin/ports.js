#!/usr/bin/env node
import { run } from '../src/cli.js';

const exitCode = await run();
process.exitCode = exitCode;
