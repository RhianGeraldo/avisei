module.exports = {
  apps: [
    {
      name: 'avisei',
      script: 'dist/server/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
}
