#!/usr/bin/env python3
"""Run Cloudflare with a Supabase key supplied on hidden stdin; never persist keys."""
import argparse
import getpass
import json
import os
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['deploy', 'dev'])
args = parser.parse_args()
key = getpass.getpass('Supabase key (hidden): ')
if not key:
    raise SystemExit('A Supabase key is required.')
if args.command == 'deploy':
    read_fd, write_fd = os.pipe()
    os.write(write_fd, json.dumps({'SUPABASE_ANON_KEY': key}).encode())
    os.close(write_fd)
    try:
        result = subprocess.run(['node_modules/.bin/cf', 'deploy', '--prebuilt', '--mode', 'production', '--secrets-file', f'/dev/fd/{read_fd}'], pass_fds=(read_fd,))
    finally:
        os.close(read_fd)
else:
    environment = dict(os.environ, SUPABASE_ANON_KEY=key)
    result = subprocess.run(['node_modules/.bin/vite', '--host', '127.0.0.1'], env=environment)
raise SystemExit(result.returncode)
