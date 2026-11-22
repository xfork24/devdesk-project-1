'use strict';
// Install the frozen dependency graph outside the read-only source tree.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devdesk-frontend-deps-'));
process.once('exit', () => fs.rmSync(directory, {recursive:true, force:true}));
try {
  for (const file of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  }
  execFileSync('npm', ['ci', '--prefix', directory, '--cache', path.join(directory, 'npm-cache'),
    '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=30000'],
    {timeout:45000, stdio:['ignore', 'pipe', 'pipe'], env:{...process.env, npm_config_update_notifier:'false'}});
  if (require(path.join(directory, 'node_modules/jsdom/package.json')).version !== '26.1.0') {
    throw new Error('Frozen jsdom version mismatch');
  }
  module.exports = require(path.join(directory, 'node_modules/jsdom'));
} catch (cause) {
  const error = new Error('Independent test environment setup failed; this is not a business Red', {cause});
  if (cause.stderr) error.message += ': ' + cause.stderr.toString();
  throw error;
}
