import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-e201ba8d/greeting.mjs';

test('Feature AC-GREET: public ESM entry returns exact primitive strings', () => {
  for (const [input, expected] of [
    ['Ada', 'Hello, Ada!'],
    ['  Ada \t', 'Hello, Ada!'],
    ['x', 'Hello, x!'],
    ['0', 'Hello, 0!'],
    [' 李雷🙂 ', 'Hello, 李雷🙂!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

// Explicit ECMAScript WhiteSpace and LineTerminator characters, not an oracle
// derived by calling trim() on the same input as the implementation.
const whitespaceCodePoints = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
];

test('Feature AC-GREET / AC-INVALID: each trim boundary character is handled', () => {
  for (const point of whitespaceCodePoints) {
    const space = String.fromCodePoint(point);
    assert.strictEqual(greeting(`${space}Ada`), 'Hello, Ada!');
    assert.strictEqual(greeting(`Ada${space}`), 'Hello, Ada!');
    assert.strictEqual(greeting(`${space}Ada${space}`), 'Hello, Ada!');
    assert.throws(() => greeting(space), TypeError);
  }
  const mixed = String.fromCodePoint(...whitespaceCodePoints);
  assert.throws(() => greeting(''), TypeError);
  assert.throws(() => greeting(mixed), TypeError);
  assert.strictEqual(greeting(`${mixed}Ada${mixed}`), 'Hello, Ada!');
});

test('Feature AC-GREET: internal characters and non-trim Unicode stay intact', () => {
  for (const [input, expected] of [
    [' A  B ', 'Hello, A  B!'],
    ['\tA\tB\nC\r', 'Hello, A\tB\nC!'],
    [' aDa!? ', 'Hello, aDa!?!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
    [' A\u00a0B ', 'Hello, A\u00a0B!'],
    [' \u200b ', 'Hello, \u200b!'],
    [' \u0085 ', 'Hello, \u0085!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

test('Feature AC-INVALID: every non-string category and omitted input throws synchronously', () => {
  for (const input of [
    undefined, null, false, true, 0, -1, 42, NaN, Infinity,
    0n, Symbol('Ada'), {}, [], ['Ada'], () => 'Ada',
    new String('Ada'), new String(''), Object.create(null),
  ]) {
    assert.throws(() => greeting(input), TypeError);
  }
  assert.throws(() => greeting(), TypeError);
});

test('Feature AC-INVALID: validation never reads object conversion or trim hooks', () => {
  const accessed = [];
  const input = Object.freeze(Object.defineProperties({}, Object.fromEntries(
    [Symbol.toPrimitive, 'toString', 'valueOf', 'trim'].map(key => [key, {
      get() {
        accessed.push(key);
        throw new Error('Input hook must not run');
      },
    }]),
  )));
  assert.throws(() => greeting(input), TypeError);
  assert.deepStrictEqual(accessed, []);
});

test('Feature AC-GREET / AC-INVALID: invalid calls leave subsequent calls deterministic', () => {
  const input = '  Ada \t';
  for (let iteration = 0; iteration < 4; iteration += 1) {
    assert.strictEqual(greeting(input), 'Hello, Ada!');
    assert.throws(() => greeting(null), TypeError);
    assert.throws(() => greeting('\t\n'), TypeError);
    assert.strictEqual(greeting(' Grace '), 'Hello, Grace!');
    assert.strictEqual(greeting(input), 'Hello, Ada!');
  }
  assert.strictEqual(input, '  Ada \t');
});
