import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../../src/standard-3be11317/add.mjs';
import { twice } from '../../src/standard-3be11317/twice.mjs';

// Feature AC-01..04, AC-10. Loader errors remain native errors.
// Task suites retain the independent, exhaustive per-interface matrices.
test('FEATURE-01: both exports synchronously compute native Number results', () => {
  for (const [a, b] of [[2, 3], [-2, -3], [-2, 0.5], [0, 0],
    [0, 7], [7, 0], [0.1, 0.2], [Number.MIN_VALUE, Number.MIN_VALUE],
    [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.strictEqual(add(a, b), a + b);
  }
  for (const n of [3, -3, 0, 0.1, -0.5, Number.MIN_VALUE,
    -Number.MIN_VALUE, Number.MAX_SAFE_INTEGER]) {
    assert.strictEqual(twice(n), n * 2);
  }
});

test('FEATURE-02: both exports preserve signed zero and allow finite-input overflow', () => {
  assert.ok(Object.is(add(-0, -0), -0));
  assert.ok(Object.is(add(-0, 0), 0));
  assert.ok(Object.is(twice(-0), -0));
  assert.ok(Object.is(twice(0), 0));
  for (const sign of [1, -1]) {
    const n = sign * Number.MAX_VALUE;
    assert.strictEqual(add(n, n), sign * Infinity);
    assert.strictEqual(twice(n), sign * Infinity);
  }
});

const invalidInputs = [
  ['undefined', undefined], ['null', null], ['numeric string', '2'],
  ['empty string', ''], ['true', true], ['false', false],
  ['object', {}], ['array', []], ['numeric array', [2]],
  ['bigint', 2n], ['symbol', Symbol('2')], ['boxed number', new Number(2)],
  ['NaN', NaN], ['positive infinity', Infinity], ['negative infinity', -Infinity],
];

test('FEATURE-03: invalid calls throw synchronously and do not contaminate either module', () => {
  for (const [label, value] of invalidInputs) {
    assert.throws(() => add(value, 1), TypeError, `${label}: first operand`);
    assert.strictEqual(twice(3), 6);
    assert.strictEqual(add(2, 3), 5);
    assert.throws(() => add(1, value), TypeError, `${label}: second operand`);
    assert.strictEqual(twice(-0.5), -1);
    assert.throws(() => add(value, value), TypeError, `${label}: both operands`);
    assert.throws(() => twice(value), TypeError, `${label}: twice`);
    assert.strictEqual(add(-2, 0.5), -1.5);
    assert.strictEqual(twice(2), 4);
  }
  assert.throws(() => add(), TypeError);
  assert.throws(() => add(1), TypeError);
  assert.throws(() => twice(), TypeError);
  assert.strictEqual(add(1, 2), 3);
  assert.strictEqual(twice(2), 4);
});

test('FEATURE-04: neither export attempts conversion of rejected objects', () => {
  let conversions = 0;
  const value = {
    [Symbol.toPrimitive]() {
      conversions += 1;
      return 2;
    },
  };
  assert.throws(() => add(value, 1), TypeError);
  assert.throws(() => add(1, value), TypeError);
  assert.throws(() => twice(value), TypeError);
  assert.strictEqual(conversions, 0);
  assert.strictEqual(add(2, 3), 5);
  assert.strictEqual(twice(3), 6);
});

test('FEATURE-05: repeated interleaved and composed calls retain each interface contract', () => {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (const [a, b] of [[2, 3], [-2, 0.5], [0.1, 0.2], [-0, -0]]) {
      assert.strictEqual(twice(add(a, b)), (a + b) * 2);
      assert.strictEqual(add(twice(a), twice(b)), a * 2 + b * 2);
      assert.strictEqual(add(a, b), a + b);
      assert.strictEqual(twice(a), a * 2);
    }
    // An overflow result is valid output, but remains invalid as a new input.
    const sum = add(Number.MAX_VALUE, Number.MAX_VALUE);
    const product = twice(Number.MAX_VALUE);
    assert.throws(() => twice(sum), TypeError);
    assert.throws(() => add(product, 1), TypeError);
    assert.throws(() => add(1, product), TypeError);
    assert.strictEqual(twice(add(1, 2)), 6);
  }
});
