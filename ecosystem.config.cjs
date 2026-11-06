module.exports = {
  apps: [
    {
      name: "sio",
      script: "server/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 10000,
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
