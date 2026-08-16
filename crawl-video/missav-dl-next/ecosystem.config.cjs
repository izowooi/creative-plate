const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "hls-download-manager",
      cwd: __dirname,
      script: path.join(__dirname, "start.sh"),
      interpreter: "/bin/bash",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: "600M",
      kill_timeout: 15000,
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3102"
      }
    }
  ]
};
