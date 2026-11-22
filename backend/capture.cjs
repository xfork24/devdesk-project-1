'use strict';
const {spawn: systemSpawn} = require('node:child_process');
const fs = require('node:fs/promises');
function failure(code) { return Object.assign(new Error(code), {code}); }

// Resolve only after close: exit alone does not mean all child resources are reaped.
async function captureRegion({destination, signal, platform = process.platform, spawn = systemSpawn, timeoutMs = 120000}) {
  if (platform !== 'darwin') throw failure('UNSUPPORTED_PLATFORM');
  if (signal?.aborted) throw failure('CAPTURE_FAILED');
  await new Promise((resolve, reject) => {
    let child, timer, escalation, reason, finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const stop = code => {
      if (reason || finished) return;
      reason = failure(code);
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), 500);
    };
    const abort = () => stop('CAPTURE_FAILED');
    try {
      child = spawn('/usr/sbin/screencapture', ['-i','-s','-x','-t','png',destination], {shell:false, stdio:'ignore'});
      child.once('error', () => finish(failure('CAPTURE_FAILED')));
      child.once('close', code => finish(reason || (code === 0 ? undefined : failure('CAPTURE_FAILED'))));
      timer = setTimeout(() => stop('CAPTURE_TIMEOUT'), timeoutMs);
      signal?.addEventListener('abort', abort, {once:true});
      if (signal?.aborted) abort();
    } catch { finish(failure('CAPTURE_FAILED')); }
  });
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isFile()) throw failure('CAPTURE_FAILED');
    return {status:'captured'};
  } catch (error) {
    if (error.code === 'ENOENT') return {status:'cancelled'};
    throw failure('CAPTURE_FAILED');
  }
}
module.exports = {captureRegion};
