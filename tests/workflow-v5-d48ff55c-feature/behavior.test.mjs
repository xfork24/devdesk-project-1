import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-d48ff55c/greeting.mjs';

// Feature regression: real public ESM interface, no mocks or external dependencies.
// Static import leaves load/export failures intact as prerequisite failures.
// Task tests retain the exhaustive type/trim matrix; these exercise whole call flows.

test('FEATURE-FLOW: AC-GREET / AC-INVALID valid, invalid and corrected calls stay independent', () => {
  const valid = [
    ['Alice', 'Hello, Alice!'],
    [' \tBob\r\n', 'Hello, Bob!'],
    ['\uFEFF\u00A0你好 🌍\u3000', 'Hello, 你好 🌍!'],
    [' A\t B\nC ', 'Hello, A\t B\nC!'],
  ];
  const invalid = ['', ' \t\r\n\uFEFF', undefined, null, 0, NaN, Infinity,
    false, true, {}, [], ['Alice'], () => 'Alice', Symbol('Alice'), 1n,
    new String('Alice'), Object.create(null)];
  for (const input of invalid) {
    for (const [name, expected] of valid) {
      assert.strictEqual(greeting(name), expected);
      assert.throws(() => greeting(input), TypeError);
      assert.strictEqual(greeting(name), expected);
    }
  }
  assert.throws(() => greeting(), TypeError);
  assert.strictEqual(greeting('Alice'), 'Hello, Alice!');
});

test('FEATURE-TEXT: AC-GREET trim boundaries preserve exact internal code units', () => {
  const cases = [
    ['\uFEFF\u2003aLiCe!?\u2028\u00A0', 'Hello, aLiCe!?!'],
    [' \u00E9 ', 'Hello, \u00E9!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
    ['\tA\u00A0\uFEFFB\r\nC\n', 'Hello, A\u00A0\uFEFFB\r\nC!'],
    [' \u200B ', 'Hello, \u200B!'],
    [' \u0085 ', 'Hello, \u0085!'],
    [' \u180E ', 'Hello, \u180E!'],
    [' \u0000 ', 'Hello, \u0000!'],
    [' \uD800 ', 'Hello, \uD800!'],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(greeting(input), expected);
    assert.strictEqual(greeting(input), expected);
  }
});

test('FEATURE-BLANK: AC-INVALID mixed trim whitespace rejects and recovery succeeds', () => {
  for (const input of ['', '\uFEFF\u00A0\u2028\u2029\u3000', '\t\r\n \u1680\u2000\u202F\u205F']) {
    assert.throws(() => greeting(input), TypeError);
    assert.strictEqual(greeting(' corrected '), 'Hello, corrected!');
  }
});

test('FEATURE-NO-COERCION: AC-INVALID rejection never touches input hooks or changes caller data', () => {
  const accesses = [];
  const input = {};
  for (const key of [Symbol.toPrimitive, 'toString', 'valueOf', 'trim']) {
    Object.defineProperty(input, key, {
      get() {
        accesses.push(key);
        throw new Error('input hook must remain untouched');
      },
    });
  }
  Object.freeze(input);
  const array = Object.freeze(['Alice']);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.throws(() => greeting(input), TypeError);
    assert.throws(() => greeting(array), TypeError);
    assert.deepStrictEqual(accesses, []);
    assert.deepStrictEqual(array, ['Alice']);
    assert.strictEqual(greeting(' Bob '), 'Hello, Bob!');
  }
});
