import test from 'node:test';
import assert from 'node:assert/strict';
import { twice } from '../../src/standard-3be11317/twice.mjs';

test('finite numbers use native multiplication', () => {
  for (const n of [2, -3, 0, -0, 0.1, -0.25, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.strictEqual(twice(n), n * 2);
  }
});

test('invalid inputs throw TypeError without coercion or residual state', () => {
  let conversions = 0;
  const object = { [Symbol.toPrimitive]() { conversions += 1; return 2; } };
  for (const n of [undefined, null, '2', '', true, false, {}, [], [2], 2n,
    Symbol('n'), new Number(2), NaN, Infinity, -Infinity, object]) {
    assert.throws(() => twice(n), TypeError);
    assert.strictEqual(twice(3), 6);
  }
  assert.throws(() => twice(), TypeError);
  assert.strictEqual(conversions, 0);
});
