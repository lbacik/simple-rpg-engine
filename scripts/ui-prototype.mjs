// THROWAWAY launcher for the game-screen visual exploration.
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

console.log('\nUI prototype: http://localhost:3000/play/prototype?variant=A');
console.log('Variants: A (chronicle), B (atlas), C (scene & decisions)\n');
const dev = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3000'], { stdio: 'inherit' });
dev.on('exit', (code) => process.exit(code ?? 0));
