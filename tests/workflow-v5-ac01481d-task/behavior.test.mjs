import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../src/workflow-v5-ac01481d/greeting.mjs';

// Task 610db576-7d93-48aa-a175-75ed81c1e018; independent contract assertions.
// Loading errors intentionally propagate; they are not business Red evidence.

test('AC-GREET: formats names and removes only surrounding whitespace', () => {
  const cases = [
    ['Ada', 'Hello, Ada!'],
    ['  Ada  ', 'Hello, Ada!'],
    ['\tAda\n', 'Hello, Ada!'],
    ['  Ada Lovelace  ', 'Hello, Ada Lovelace!'],
    ['  Ada  Lovelace  ', 'Hello, Ada  Lovelace!'],
    ['\tAda\tLovelace\n', 'Hello, Ada\tLovelace!'],
    ['\u00a0\ufeffAda\u2003\u2029', 'Hello, Ada!'],
    ['  李雷🙂  ', 'Hello, 李雷🙂!'],
    ['  aDa, Jr.!  ', 'Hello, aDa, Jr.!!'],
    ['x', 'Hello, x!'],
    ['\u200b', 'Hello, \u200b!'],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(greeting(input), expected, JSON.stringify(input));
  }
});

test('AC-INVALID: rejects empty and native-trim whitespace-only strings', () => {
  for (const input of ['', '   ', '\t\n', '\r\n\v\f', '\u00a0\ufeff\u2003\u2029']) {
    assert.throws(() => greeting(input), TypeError, JSON.stringify(input));
  }
});

test('AC-INVALID: rejects omitted arguments and all non-string input categories', () => {
  assert.throws(() => greeting(), TypeError, 'omitted argument');
  const cases = [
    ['undefined', undefined],
    ['null', null],
    ['zero', 0],
    ['number', 42],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['false', false],
    ['true', true],
    ['object', {}],
    ['empty array', []],
    ['name array', ['Ada']],
    ['symbol', Symbol('Ada')],
    ['bigint', 1n],
    ['boxed string', new String('Ada')],
    ['function', () => 'Ada'],
    ['null-prototype object', Object.create(null)],
  ];
  for (const [label, input] of cases) {
    assert.throws(() => greeting(input), TypeError, label);
  }
});

test('AC-INVALID: rejects objects without invoking trim or conversion hooks', () => {
  const touched = [];
  const input = {};
  for (const property of ['trim', 'toString', 'valueOf', Symbol.toPrimitive]) {
    Object.defineProperty(input, property, {
      get() {
        touched.push(property);
        throw new Error('caller hook must not be read');
      },
    });
  }
  Object.freeze(input);
  assert.throws(() => greeting(input), TypeError);
  assert.deepStrictEqual(touched, []);
});

test('AC-GREET / AC-INVALID: repeated calls and rejection do not change later results', () => {
  const rejected = Object.freeze(['Ada']);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.strictEqual(greeting('  Ada  '), 'Hello, Ada!');
    assert.throws(() => greeting(' \t\n '), TypeError);
    assert.throws(() => greeting(rejected), TypeError);
    assert.deepStrictEqual(rejected, ['Ada']);
    assert.strictEqual(greeting('Grace'), 'Hello, Grace!');
    assert.strictEqual(greeting('  Ada  '), 'Hello, Ada!');
  }
});
