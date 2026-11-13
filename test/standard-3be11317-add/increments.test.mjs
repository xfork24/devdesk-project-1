import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../../src/standard-3be11317/add.mjs';

test('increment 1: native addition', () => {
  for (const [a, b] of [[2, 3], [-2, -3], [-7, 4], [0, 9], [0, 0], [0.1, 0.2], [-0, -0], [Number.MAX_VALUE, Number.MAX_VALUE]]) {
    assert.strictEqual(add(a, b), a + b);
  }
});

test('increment 2: reject invalid operands without coercion', () => {
  let coercions = 0;
  const object = { [Symbol.toPrimitive]() { coercions += 1; return 2; } };
  const invalid = [undefined, null, '2', true, false, {}, [], 2n, Symbol('2'), new Number(2), NaN, Infinity, -Infinity, object];
  for (const value of invalid) {
    assert.throws(() => add(value, 1), TypeError);
    assert.throws(() => add(1, value), TypeError);
    assert.throws(() => add(value, value), TypeError);
    assert.strictEqual(add(2, 3), 5);
  }
  assert.throws(() => add(), TypeError);
  assert.throws(() => add(1), TypeError);
  assert.strictEqual(coercions, 0);
});
