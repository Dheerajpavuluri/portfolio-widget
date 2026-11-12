// Starts the Vite dev server, compiles the main and preload scripts, and
// launches Electron pointed at the dev server. Renderer changes reload live;
// changes to src/main or src/preload need a restart of this script.

import { spawn, spawnSync } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const compile = spawnSync('npm', ['run', 'build:electron'], { stdio: 'inherit', shell: true });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const server = await createServer({ configFile: 'vite.config.mts' });
try {
  await server.listen();
} catch (error) {
  console.error(`\n${error.message}. The app is probably already running in another terminal.`);
  console.error('Close it, or free the port with: lsof -ti :5173 | xargs kill\n');
  process.exit(1);
}
const url = server.resolvedUrls.local[0];

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
