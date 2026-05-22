import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

execFileSync('npx', ['tsc', '-p', './tsconfig.build.json'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
});

mkdirSync('build', { recursive: true });
for (const file of readdirSync('src')) {
    if (file.endsWith('.js')) {
        cpSync(join('src', file), join('build', file));
    }
}
