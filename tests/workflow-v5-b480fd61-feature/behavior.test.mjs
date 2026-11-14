import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-b480fd61/greeting.mjs';

// Feature regression through the real public interface; no mocks or coercion wrapper.
// Loading or export failures remain native errors, not business assertion Red.
test('FEATURE-GREET: exact synchronous results for normal and trimmed names', () => {
  for (const [input, expected] of [
    ['Alice', 'Hello, Alice!'],
    ['  Alice\t', 'Hello, Alice!'],
    ['\r\n\u00a0\u2003\ufeff张 三\ufeff\u2003\u00a0\n', 'Hello, 张 三!'],
    ['  aLiCe  Bob  ', 'Hello, aLiCe  Bob!'],
    ['\tAlice\tBob\n', 'Hello, Alice\tBob!'],
    ['0', 'Hello, 0!'],
    ['!', 'Hello, !!'],
    [' \u200b ', 'Hello, \u200b!'],
  ]) {
    assert.equal(greeting(input), expected);
  }
});

test('FEATURE-EMPTY: empty and standard whitespace-only strings throw synchronously', () => {
  for (const input of ['', ' ', '\t\r\n', '\u00a0\u2003\ufeff']) {
    assert.throws(() => greeting(input), TypeError);
  }
});

test('FEATURE-TYPE: missing arguments and all non-string categories are rejected', () => {
  assert.throws(() => greeting(), TypeError);
  for (const input of [
    undefined, null, 0, 42, NaN, Infinity, true, false,
    {}, [], ['Alice'], new String('Alice'), () => 'Alice', Symbol('Alice'), 0n,
  ]) {
    assert.throws(() => greeting(input), TypeError);
  }
});

test('FEATURE-NO-COERCION: rejects caller objects without invoking their hooks', () => {
  const calls = [];
  const input = Object.freeze({
    get trim() {
      calls.push('trim');
      return () => 'Alice';
    },
    toString() {
      calls.push('toString');
      return 'Alice';
    },
    [Symbol.toPrimitive]() {
      calls.push('toPrimitive');
      return 'Alice';
    },
  });
  const descriptors = Object.getOwnPropertyDescriptors(input);
  assert.throws(() => greeting(input), TypeError);
  assert.deepEqual(calls, []);
  assert.deepEqual(Object.getOwnPropertyDescriptors(input), descriptors);
});

test('FEATURE-RECOVERY: interleaved callers can recover and repeat without shared state', () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(greeting(' Alice '), 'Hello, Alice!');
    assert.throws(() => greeting(null), TypeError);
    assert.equal(greeting('Bob'), 'Hello, Bob!');
    assert.throws(() => greeting(' \t\n '), TypeError);
    assert.equal(greeting(' Alice '), 'Hello, Alice!');
    assert.throws(() => greeting(), TypeError);
    assert.equal(greeting(' 张 三 '), 'Hello, 张 三!');
  }
});
