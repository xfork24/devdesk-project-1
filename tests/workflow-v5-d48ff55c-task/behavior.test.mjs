import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-d48ff55c/greeting.mjs';

// Static import deliberately preserves missing-module/export errors as prerequisites.
// No error-message contract, coercion, external services, or shared fixtures.

test('AC-GREET: ordinary primitive strings return the exact synchronous greeting', () => {
  for (const [input, expected] of [
    ['Alice', 'Hello, Alice!'],
    ['Bob', 'Hello, Bob!'],
    ['a', 'Hello, a!'],
    ['0', 'Hello, 0!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

// ECMAScript trim whitespace and line terminators; U+200B is intentionally absent.
const trimCharacters = [
  '\u0009', '\u000A', '\u000B', '\u000C', '\u000D', '\u0020',
  '\u00A0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003',
  '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009',
  '\u200A', '\u2028', '\u2029', '\u202F', '\u205F', '\u3000', '\uFEFF',
];

test('AC-GREET: trim every JavaScript whitespace character at either end', () => {
  for (const whitespace of trimCharacters) {
    const label = `U+${whitespace.codePointAt(0).toString(16)}`;
    assert.strictEqual(greeting(`${whitespace}Alice`), 'Hello, Alice!', label);
    assert.strictEqual(greeting(`Alice${whitespace}`), 'Hello, Alice!', label);
    assert.strictEqual(greeting(`${whitespace}Alice${whitespace}`), 'Hello, Alice!', label);
  }
  assert.strictEqual(greeting(' \t\r\n Alice \u00A0\uFEFF'), 'Hello, Alice!');
});

test('AC-GREET: preserve internal whitespace, case, punctuation and Unicode code units', () => {
  for (const [input, expected] of [
    [' A  B ', 'Hello, A  B!'],
    [' A\tB\nC ', 'Hello, A\tB\nC!'],
    [' aLiCe!? ', 'Hello, aLiCe!?!'],
    [' 你好 🌍 ', 'Hello, 你好 🌍!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
    [' \u00E9 ', 'Hello, \u00E9!'],
    ['\u200BAlice\u200B', 'Hello, \u200BAlice\u200B!'],
    ['\u200B', 'Hello, \u200B!'],
  ]) {
    assert.strictEqual(greeting(input), expected);
  }
});

test('AC-INVALID: empty and whitespace-only primitive strings synchronously throw TypeError', () => {
  assert.throws(() => greeting(''), TypeError);
  for (const whitespace of trimCharacters) {
    assert.throws(() => greeting(whitespace), TypeError);
    assert.throws(() => greeting(whitespace.repeat(3)), TypeError);
  }
  assert.throws(() => greeting(trimCharacters.join('')), TypeError);
});

const invalidInputs = [
  ['undefined', undefined], ['null', null],
  ['zero', 0], ['positive number', 42], ['negative number', -1],
  ['NaN', NaN], ['Infinity', Infinity],
  ['false', false], ['true', true],
  ['plain object', {}], ['name object', { name: 'Alice' }],
  ['empty array', []], ['string array', ['Alice']],
  ['function', () => 'Alice'], ['symbol', Symbol('Alice')],
  ['bigint zero', 0n], ['bigint', 42n],
  ['boxed string', new String('Alice')], ['boxed empty string', new String('')],
  ['boxed number', new Number(42)], ['boxed boolean', new Boolean(true)],
  ['null-prototype object', Object.create(null)],
];

for (const [label, input] of invalidInputs) {
  test(`AC-INVALID: reject ${label} with synchronous TypeError`, () => {
    assert.throws(() => greeting(input), TypeError);
  });
}

test('AC-INVALID: omitted argument synchronously throws TypeError', () => {
  assert.throws(() => greeting(), TypeError);
});

test('AC-INVALID: reject objects before accessing conversion or trim hooks', () => {
  const accesses = [];
  const input = {};
  for (const key of [Symbol.toPrimitive, 'toString', 'valueOf', 'trim']) {
    Object.defineProperty(input, key, {
      get() {
        accesses.push(key);
        return () => 'Alice';
      },
    });
  }
  Object.freeze(input);
  assert.throws(() => greeting(input), TypeError);
  assert.deepStrictEqual(accesses, []);
});

test('AC-GREET / AC-INVALID: repeated calls and failures do not affect later calls', () => {
  const input = ' Alice ';
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.strictEqual(greeting(input), 'Hello, Alice!');
    assert.throws(() => greeting(' \t\n'), TypeError);
    assert.strictEqual(greeting('Bob'), 'Hello, Bob!');
    assert.throws(() => greeting(null), TypeError);
    assert.strictEqual(greeting(input), 'Hello, Alice!');
  }
  assert.strictEqual(input, ' Alice ');
});
