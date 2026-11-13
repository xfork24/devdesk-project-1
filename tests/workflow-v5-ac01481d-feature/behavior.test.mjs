import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-ac01481d/greeting.mjs';

// Feature eaa9e132-24b5-47f7-8ea3-6df27ae48eaf; sole Task: greeting.
// Static import preserves loading errors as setup failures, not business Red.
// No fixtures, external services, persistent state, or cleanup are required.

test('Feature AC-GREET: public ESM entry returns exact synchronous greetings', () => {
  const cases = [
    ['Ada', 'Hello, Ada!'],
    ['  Ada  ', 'Hello, Ada!'],
    ['\tAda\n', 'Hello, Ada!'],
    ['  Ada Lovelace  ', 'Hello, Ada Lovelace!'],
    ['  Ada  \tLovelace  ', 'Hello, Ada  \tLovelace!'],
    ['\n李雷🙂\r', 'Hello, 李雷🙂!'],
    ['  aDa, Jr.!  ', 'Hello, aDa, Jr.!!'],
    [' e\u0301 ', 'Hello, e\u0301!'],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(greeting(input), expected, JSON.stringify(input));
  }
});

test('Feature AC-GREET / AC-INVALID: native trim boundaries preserve internal whitespace', () => {
  // Explicit ECMAScript whitespace/line terminators: expected values do not
  // call trim(), so a product implementation is not used as the test oracle.
  const whitespace = [
    0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
  ].map((codePoint) => String.fromCodePoint(codePoint));
  for (const space of whitespace) {
    const label = `U+${space.codePointAt(0).toString(16)}`;
    assert.strictEqual(greeting(`${space}Ada`), 'Hello, Ada!', `${label}: leading`);
    assert.strictEqual(greeting(`Ada${space}`), 'Hello, Ada!', `${label}: trailing`);
    assert.strictEqual(greeting(`${space}Ada${space}Lovelace${space}`),
      `Hello, Ada${space}Lovelace!`, `${label}: internal`);
    assert.throws(() => greeting(space.repeat(2)), TypeError, `${label}: empty after trim`);
  }
  const mixed = whitespace.join('');
  assert.throws(() => greeting(mixed), TypeError);
  assert.strictEqual(greeting(`${mixed}Ada${mixed}`), 'Hello, Ada!');
});

test('Feature AC-GREET: non-trim characters remain valid name content', () => {
  for (const character of ['\u0085', '\u180e', '\u200b', '\u2060']) {
    assert.strictEqual(greeting(character), `Hello, ${character}!`);
    assert.strictEqual(greeting(` \t${character}Ada${character}\n `),
      `Hello, ${character}Ada${character}!`);
  }
});

test('Feature AC-GREET / AC-INVALID: callers recover from rejection and repeat safely', () => {
  const rejectedInputs = [
    '', '   ', '\t\n', undefined, null, 0, 42, NaN, Infinity,
    false, true, {}, [], ['Ada'], Symbol('Ada'), 1n, new String('Ada'),
    () => 'Ada', Object.create(null),
  ];
  assert.throws(() => greeting(), TypeError);
  for (const input of rejectedInputs) {
    assert.strictEqual(greeting('  Ada  '), 'Hello, Ada!');
    assert.throws(() => greeting(input), TypeError);
    assert.strictEqual(greeting('\tGrace Hopper\n'), 'Hello, Grace Hopper!');
    assert.throws(() => greeting(input), TypeError);
    assert.strictEqual(greeting('  Ada  '), 'Hello, Ada!');
  }
});

test('Feature AC-INVALID / AC-GREET: object rejection has no caller side effects', () => {
  const accesses = [];
  const input = {};
  for (const key of ['trim', 'toString', 'valueOf', Symbol.toPrimitive]) {
    Object.defineProperty(input, key, {
      get() {
        accesses.push(key);
        throw new Error('caller properties must not be accessed');
      },
    });
  }
  Object.freeze(input);
  const before = Object.getOwnPropertyDescriptors(input);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(() => greeting(input), TypeError);
    assert.deepStrictEqual(accesses, []);
    assert.deepStrictEqual(Object.getOwnPropertyDescriptors(input), before);
    assert.strictEqual(greeting('  Ada  '), 'Hello, Ada!');
  }
});
