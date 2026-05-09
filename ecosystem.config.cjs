module.exports = {
  apps: [
    {
      name: 'avisei',
      script: '.output/server/index.mjs',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
}
