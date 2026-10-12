import { readFileSync, writeFileSync } from 'node:fs';
const strip = (f) => readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export (const|function|async function) /gm, '$1 ');
let html = readFileSync('shell.html', 'utf8');
html = html.replace('/*__RULES__*/', () => strip('rules.mjs')).replace('/*__FIXTURES__*/', () => strip('fixtures.mjs')).replace('/*__SOLVER__*/', () => strip('solver.mjs')).replace('/*__PAGE__*/', () => strip('content.js') + '\n' + strip('page.js'));
writeFileSync(process.argv[2] || 'combat-balance.prototype.html', html);
