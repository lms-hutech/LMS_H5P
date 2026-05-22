import { cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

rmSync('build', { recursive: true, force: true });
execFileSync('npx', ['tsc', '-p', './tsconfig.build.json'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
});
cpSync('src/schemas', 'build/src/schemas', { recursive: true });
cpSync('assets', 'build/assets', { recursive: true });
