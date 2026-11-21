// Runs before `npm start`: installs dependencies on a fresh checkout so one command is enough.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'node_modules', 'vite'))) {
  console.log('Installing dependencies (first run only)...');
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}
