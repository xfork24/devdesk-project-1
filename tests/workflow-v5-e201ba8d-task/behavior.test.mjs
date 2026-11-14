import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-e201ba8d/greeting.mjs';

test('AC-GREET: returns the exact synchronous greeting for primitive strings', () => {
  for (const [input, expected] of [
    ['Ada', 'Hello, Ada!'],
    ['a', 'Hello, a!'],
    ['0', 'Hello, 0!'],
    ['李雷🙂', 'Hello, 李雷🙂!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

test('AC-GREET: trims surrounding ECMAScript whitespace', () => {
  for (const input of [
    '  Ada \t',
    '\r\n\v\fAda\n\r',
    '\u00a0\u1680\u2003\u2028\u2029\u202f\u205f\u3000\ufeffAda\ufeff',
  ]) {
    assert.strictEqual(greeting(input), 'Hello, Ada!');
  }
});

test('AC-GREET: preserves internal whitespace, case, punctuation and Unicode', () => {
  for (const [input, expected] of [
    [' A  B ', 'Hello, A  B!'],
    [' A\tB\nC ', 'Hello, A\tB\nC!'],
    [' aDa!? ', 'Hello, aDa!?!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
    ['\u200b', 'Hello, \u200b!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

test('AC-INVALID: rejects empty and whitespace-only strings synchronously', () => {
  for (const input of [
    '', ' ', '\t\r\n\v\f',
    '\u00a0\u1680\u2000\u2003\u2028\u2029\u202f\u205f\u3000\ufeff',
  ]) {
    assert.throws(() => greeting(input), TypeError);
  }
});

test('AC-INVALID: rejects non-string types and omitted arguments', () => {
  for (const input of [
    undefined, null, 42, 0, NaN, Infinity, true, false, 1n,
    Symbol('Ada'), {}, [], ['Ada'], () => 'Ada', new String('Ada'),
  ]) {
    assert.throws(() => greeting(input), TypeError);
  }
  assert.throws(() => greeting(), TypeError);
});

test('AC-INVALID: rejects objects before invoking conversion or trim hooks', () => {
  const calls = [];
  const input = Object.freeze({
    [Symbol.toPrimitive]() { calls.push('toPrimitive'); return 'Ada'; },
    toString() { calls.push('toString'); return 'Ada'; },
    valueOf() { calls.push('valueOf'); return 'Ada'; },
    get trim() { calls.push('trim'); return () => 'Ada'; },
  });
  assert.throws(() => greeting(input), TypeError);
  assert.deepStrictEqual(calls, []);
});

test('AC-GREET / AC-INVALID: repeated calls and failures do not affect later results', () => {
  const input = '  Ada \t';
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.strictEqual(greeting(input), 'Hello, Ada!');
    assert.throws(() => greeting(null), TypeError);
    assert.throws(() => greeting('  '), TypeError);
    assert.strictEqual(greeting('Grace'), 'Hello, Grace!');
    assert.strictEqual(greeting(input), 'Hello, Ada!');
  }
  assert.strictEqual(input, '  Ada \t');
});
