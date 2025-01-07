module.exports = {
    apps: [
      {
        name: 'nest-server',
        script: 'npm',
        args: 'run start:server',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G'
      },
      {
        name: 'discord-bot',
        cwd: './discord',
        script: 'ts-node',
        args: 'index.ts',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G'
      }
    ]
  };