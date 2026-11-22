'use strict';
// The runner must mount the provisioned shared dependency directory read-only.
// No package manager, network access, or author-session node_modules is used.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const cache = process.env.DEVDESK_RUNTIME_CACHE || '/tmp/devdesk-runtime/shared';
const directory = path.join(cache, 'frontend-jsdom-26.1.0');
try {
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest(path.join(directory, 'package-lock.json')) !== digest(path.join(__dirname, 'package-lock.json'))) {
    throw new Error('Provisioned dependency lock does not match frozen lock');
  }
  if (require(path.join(directory, 'node_modules/jsdom/package.json')).version !== '26.1.0') {
    throw new Error('Frozen jsdom version mismatch');
  }
  module.exports = require(path.join(directory, 'node_modules/jsdom'));
} catch (cause) {
  throw new Error('Independent test environment setup failed; provision the frozen offline dependency directory at '
    + directory + ' and mount it read-only in the independent runner; this is not a business Red', {cause});
}
