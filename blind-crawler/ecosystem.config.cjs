const path = require('path');
module.exports = { apps: [{ name: 'blind-archive', cwd: __dirname,
  script: path.join(__dirname, '.venv/bin/python'), interpreter: 'none',
  args: '-m blind_archive.server --port 5067', autorestart: true,
  restart_delay: 5000, max_restarts: 20, min_uptime: '30s', kill_timeout: 20000,
  env: { PYTHONUNBUFFERED: '1', BLIND_DATA_DIR: '/Volumes/sn850x/blind-archive-data' },
  time: true, max_memory_restart: '1G'
}] };
