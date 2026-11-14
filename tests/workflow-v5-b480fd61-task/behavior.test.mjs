import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-b480fd61/greeting.mjs';

// AC-GREET: exercise the real synchronous, named ESM interface.
test('AC-GREET: returns the exact greeting for primitive strings', () => {
  for (const [input, expected] of [
    ['Alice', 'Hello, Alice!'],
    ['aLiCe', 'Hello, aLiCe!'],
    ['0', 'Hello, 0!'],
    ['张 三', 'Hello, 张 三!'],
    ['!', 'Hello, !!'],
  ]) {
    assert.equal(greeting(input), expected);
  }
});

test('AC-GREET: trims standard leading and trailing whitespace', () => {
  for (const input of [
    ' Alice ',
    '\t\n\rAlice\r\n\t',
    '\u00a0\u2003\ufeffAlice\ufeff\u2003\u00a0',
  ]) {
    assert.equal(greeting(input), 'Hello, Alice!');
  }
});

test('AC-GREET: preserves internal whitespace and content', () => {
  assert.equal(greeting('  Alice  Bob  '), 'Hello, Alice  Bob!');
  assert.equal(greeting('\tAlice\tBob\n'), 'Hello, Alice\tBob!');
  assert.equal(greeting(' \u200b '), 'Hello, \u200b!');
});

test('AC-INVALID: rejects empty and whitespace-only primitive strings synchronously', () => {
  for (const input of ['', ' ', '\t\r\n', '\u00a0\u2003\ufeff']) {
    assert.throws(() => greeting(input), TypeError);
  }
});

test('AC-INVALID: rejects an omitted argument and explicit undefined', () => {
  assert.throws(() => greeting(), TypeError);
  assert.throws(() => greeting(undefined), TypeError);
});

test('AC-INVALID: rejects every non-string type without coercion', () => {
  for (const input of [
    null, 0, 42, NaN, Infinity, true, false,
    {}, [], ['Alice'], new String('Alice'), () => 'Alice',
    Symbol('Alice'), 0n,
  ]) {
    assert.throws(() => greeting(input), TypeError);
  }
});

test('AC-INVALID: rejects objects before invoking trim or coercion hooks', () => {
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
  assert.throws(() => greeting(input), TypeError);
  assert.deepEqual(calls, []);
});

test('AC-GREET / AC-INVALID: repeated calls and failures do not affect later calls', () => {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.equal(greeting(' Alice '), 'Hello, Alice!');
    assert.throws(() => greeting(' \t '), TypeError);
    assert.throws(() => greeting(null), TypeError);
    assert.equal(greeting('Bob'), 'Hello, Bob!');
  }
});
