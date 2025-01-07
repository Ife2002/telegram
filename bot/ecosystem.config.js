module.exports = {
    apps: [
      {
        name: 'nest-server',
        script: 'npm',
        args: 'run start:server',
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
          NODE_ENV: 'development'
        }
      },
      {
        name: 'discord-bot',
        cwd: './bot/discord',
        script: 'npx',
        args: 'ts-node index.ts',
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
          NODE_ENV: 'development'
        }
      }
    ]
  };