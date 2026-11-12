// Starts the Vite dev server, compiles the main and preload scripts, and
// launches Electron pointed at the dev server. Renderer changes reload live;
// changes to src/main or src/preload need a restart of this script.

import { spawn, spawnSync } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const compile = spawnSync('npm', ['run', 'build:electron'], { stdio: 'inherit', shell: true });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
