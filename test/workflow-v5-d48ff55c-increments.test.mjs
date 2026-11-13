import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../src/workflow-v5-d48ff55c/greeting.mjs';

test('AC-GREET: exact greetings, trim and preserved internal characters', () => {
  for (const [input, expected] of [
    ['Alice', 'Hello, Alice!'],
    ['Bob', 'Hello, Bob!'],
    [' \tAlice\n', 'Hello, Alice!'],
    [' A  B ', 'Hello, A  B!'],
    [' 你好 🌍 ', 'Hello, 你好 🌍!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
  ]) assert.strictEqual(greeting(input), expected);
});

test('AC-INVALID: reject empty strings and nonstrings without coercion; calls stay independent', () => {
  for (const input of ['', ' \t\n', undefined, null, 0, NaN, Infinity,
    false, true, {}, [], () => 'Alice', Symbol('Alice'), 1n,
    new String('Alice'), Object.create(null)]) {
    assert.throws(() => greeting(input), TypeError);
  }
  assert.throws(() => greeting(), TypeError);
  const accesses = [];
  const input = {};
  for (const key of [Symbol.toPrimitive, 'toString', 'valueOf', 'trim']) {
    Object.defineProperty(input, key, { get() { accesses.push(key); return () => 'Alice'; } });
  }
  assert.throws(() => greeting(Object.freeze(input)), TypeError);
  assert.deepStrictEqual(accesses, []);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(greeting(' Alice '), 'Hello, Alice!');
    assert.throws(() => greeting(''), TypeError);
    assert.throws(() => greeting(null), TypeError);
    assert.strictEqual(greeting('Bob'), 'Hello, Bob!');
  }
});
