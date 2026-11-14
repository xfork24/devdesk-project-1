import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../../src/standard-3be11317/add.mjs';

// Task add: AC-01, AC-02 and the independent-test portion of AC-05/AC-07.
// Import failures intentionally remain native loader errors, not business Red.

test('ADD-01: finite numbers return synchronous native addition', () => {
  const inputs = [
    [2, 3], [-2, -3], [-7, 4], [7, -4],
    [0, 0], [0, 9], [9, 0], [0.1, 0.2], [-1.25, 2.5],
    [Number.MIN_VALUE, Number.MIN_VALUE],
    [Number.MAX_SAFE_INTEGER, 1],
    [2 ** 53, 1], [1e20, -1],
    [Number.MAX_VALUE, -Number.MAX_VALUE],
  ];
  for (const [a, b] of inputs) {
    assert.strictEqual(add(a, b), a + b, `add(${a}, ${b})`);
  }
});

test('ADD-02: preserve the sign of native zero results', () => {
  for (const [a, b, expected] of [
    [-0, -0, -0], [-0, 0, 0], [0, -0, 0], [-1, 1, 0],
  ]) {
    assert.ok(Object.is(add(a, b), expected));
  }
});

test('ADD-03: finite operands may overflow in either direction', () => {
  assert.strictEqual(add(Number.MAX_VALUE, Number.MAX_VALUE), Infinity);
  assert.strictEqual(add(-Number.MAX_VALUE, -Number.MAX_VALUE), -Infinity);
});

const invalidInputs = [
  ['undefined', undefined], ['null', null], ['numeric string', '2'],
  ['empty string', ''], ['true', true], ['false', false],
  ['object', {}], ['empty array', []], ['numeric array', [2]],
  ['bigint', 2n], ['symbol', Symbol('2')], ['boxed number', new Number(2)],
  ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
];

test('ADD-04: reject every invalid value in either argument position', () => {
  for (const [label, value] of invalidInputs) {
    for (const valid of [0, 3, -2.5]) {
      assert.throws(() => add(value, valid), TypeError, `${label} first`);
      assert.throws(() => add(valid, value), TypeError, `${label} second`);
    }
  }
});

test('ADD-05: reject pairs of invalid arguments and missing arguments', () => {
  for (const [firstLabel, a] of invalidInputs) {
    for (const [secondLabel, b] of invalidInputs) {
      assert.throws(() => add(a, b), TypeError, `${firstLabel}, ${secondLabel}`);
    }
  }
  assert.throws(() => add(), TypeError);
  assert.throws(() => add(1), TypeError);
});

test('ADD-06: reject objects without attempting numeric coercion', () => {
  let coercions = 0;
  const value = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      return 2;
    },
  };
  assert.throws(() => add(value, 3), TypeError);
  assert.throws(() => add(3, value), TypeError);
  assert.strictEqual(coercions, 0);
});

test('ADD-07: failed and repeated calls do not affect later results', () => {
  for (const [, value] of invalidInputs) {
    assert.throws(() => add(value, 1), TypeError);
    assert.strictEqual(add(2, 3), 5);
    assert.throws(() => add(1, value), TypeError);
    assert.strictEqual(add(-2, 0.5), -1.5);
  }
  for (let i = 0; i < 3; i += 1) {
    assert.strictEqual(add(2, 3), 5);
    assert.ok(Object.is(add(-0, -0), -0));
  }
});
