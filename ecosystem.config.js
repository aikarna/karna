module.exports = {
  apps: [
    {
      name: "karna-server",
      cwd: "./server",
      script: "node",
      args: "index.js",
      env: {
        NODE_ENV: "production"
        // .env in ./server still loads API keys, secrets, etc.
      },
      autorestart: true,
      max_restarts: 20,
      watch: false,
      out_file: "~/.pm2/logs/karna-server.out.log",
      error_file: "~/.pm2/logs/karna-server.err.log"
    },
    {
      name: "karna-web",
      cwd: "./web",
      script: "npm",
      args: "run dev",
      env: {
        VITE_API: "http://localhost:5001"
      },
      autorestart: true,
      watch: false,
      out_file: "~/.pm2/logs/karna-web.out.log",
      error_file: "~/.pm2/logs/karna-web.err.log"
    }
  ]
};
