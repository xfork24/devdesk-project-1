import test from 'node:test';
import assert from 'node:assert/strict';
import { twice } from '../../src/standard-3be11317/twice.mjs';

// AC-03: preserve JavaScript Number multiplication without rounding or coercion.
test('twice returns the native product for finite primitive numbers', () => {
  const inputs = [0, 1, 2, -1, -7, 0.1, -0.25, 1.75,
    Number.EPSILON, Number.MIN_VALUE, -Number.MIN_VALUE,
    Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
  for (const input of inputs) {
    assert.strictEqual(twice(input), input * 2, `input: ${input}`);
  }
});

test('twice preserves the sign of zero', () => {
  assert.ok(Object.is(twice(-0), -0));
  assert.ok(Object.is(twice(0), 0));
});

test('twice permits overflow from finite inputs', () => {
  assert.strictEqual(twice(Number.MAX_VALUE), Infinity);
  assert.strictEqual(twice(-Number.MAX_VALUE), -Infinity);
});

// AC-04: all invalid values must throw synchronously, regardless of message.
const invalidInputs = [
  ['undefined', undefined],
  ['null', null],
  ['numeric string', '2'],
  ['empty string', ''],
  ['non-numeric string', 'invalid'],
  ['true', true],
  ['false', false],
  ['object', {}],
  ['empty array', []],
  ['numeric array', [2]],
  ['bigint', 2n],
  ['symbol', Symbol('number')],
  ['boxed number', new Number(2)],
  ['function', () => 2],
  ['NaN', NaN],
  ['positive infinity', Infinity],
  ['negative infinity', -Infinity],
];

for (const [label, input] of invalidInputs) {
  test(`twice rejects ${label} and a subsequent valid call succeeds`, () => {
    assert.throws(() => twice(input), TypeError);
    assert.strictEqual(twice(3), 6);
  });
}

test('twice rejects a missing argument synchronously', () => {
  assert.throws(() => twice(), TypeError);
  assert.strictEqual(twice(-2), -4);
});

test('twice rejects objects without invoking numeric conversion', () => {
  let conversions = 0;
  const input = {
    [Symbol.toPrimitive]() {
      conversions += 1;
      return 2;
    },
  };
  assert.throws(() => twice(input), TypeError);
  assert.strictEqual(conversions, 0);
  assert.strictEqual(twice(1.5), 3);
});

test('repeated valid and invalid calls have independent results', () => {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.strictEqual(twice(-4), -8);
    assert.throws(() => twice(NaN), TypeError);
    assert.strictEqual(twice(2.5), 5);
    assert.ok(Object.is(twice(-0), -0));
  }
});
