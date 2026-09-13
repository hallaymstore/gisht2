const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['server.js', 'src', 'public/app.js', 'scripts/self-test.js'];
const files = [];
function walk(p) {
  const abs = path.resolve(__dirname, '..', p);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(abs)) walk(path.relative(path.resolve(__dirname, '..'), path.join(abs, name)));
  } else if (abs.endsWith('.js')) files.push(abs);
}
roots.forEach(walk);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`\n[XATO] ${path.relative(path.resolve(__dirname, '..'), file)}\n${result.stderr}`);
  } else console.log(`[OK] ${path.relative(path.resolve(__dirname, '..'), file)}`);
}
process.exitCode = failed ? 1 : 0;
