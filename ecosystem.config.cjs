module.exports = {
  apps: [
    {
      name: "sio",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 10000,
      time: true,
      // NODE_ENV e demais parâmetros são lidos do .env.
    },
  ],
};
