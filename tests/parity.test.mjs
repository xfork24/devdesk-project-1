import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyParity } from '../src/parity.mjs';

// Independent public-interface assertions. Loading errors must remain loading
// errors; no fallback implementation or import-error conversion is permitted.
const invalid = '输入无效';

for (const [label, value, expected] of [
  ['positive even', 2, '偶数'],
  ['positive odd', 3, '奇数'],
  ['negative even', -2, '偶数'],
  ['negative odd', -3, '奇数'],
  ['smallest positive odd', 1, '奇数'],
  ['smallest negative odd', -1, '奇数'],
  ['larger positive even', 24680, '偶数'],
  ['larger negative even', -24680, '偶数'],
  ['larger positive odd', 13579, '奇数'],
  ['larger negative odd', -13579, '奇数'],
]) {
  test(`AC-001 signed integers: ${label}`, () => {
    assert.strictEqual(classifyParity(value), expected);
  });
}

for (const [label, value] of [['+0', 0], ['-0', -0]]) {
  test(`AC-002 signed zero: ${label}`, () => {
    assert.strictEqual(classifyParity(value), '偶数');
  });
}

for (const [label, value, expected] of [
  ['lower endpoint', -1000000, '偶数'],
  ['upper endpoint', 1000000, '偶数'],
  ['lower inner odd', -999999, '奇数'],
  ['upper inner odd', 999999, '奇数'],
  ['lower inner even', -999998, '偶数'],
  ['upper inner even', 999998, '偶数'],
  ['below lower endpoint', -1000001, invalid],
  ['above upper endpoint', 1000001, invalid],
  ['distant negative integer', -2000000, invalid],
  ['distant positive integer', 2000000, invalid],
  ['minimum safe integer', Number.MIN_SAFE_INTEGER, invalid],
  ['maximum safe integer', Number.MAX_SAFE_INTEGER, invalid],
]) {
  test(`AC-003 closed interval: ${label}`, () => {
    assert.strictEqual(classifyParity(value), expected);
  });
}

for (const [label, value] of [
  ['positive fraction', 1.5],
  ['negative fraction', -1.5],
  ['fraction below upper endpoint', 999999.5],
  ['fraction above lower endpoint', -999999.5],
  ['smallest positive fraction', Number.MIN_VALUE],
  ['smallest negative fraction', -Number.MIN_VALUE],
  ['numeric string', '2'],
  ['negative numeric string', '-3'],
  ['empty string', ''],
  ['whitespace string', ' '],
  ['true', true],
  ['false', false],
  ['null', null],
  ['explicit undefined', undefined],
  ['empty array', []],
  ['numeric array', [2]],
  ['Set', new Set([2])],
  ['Map', new Map([['value', 2]])],
  ['plain object', { value: 2 }],
  ['null-prototype object', Object.create(null)],
  ['boxed number', new Number(2)],
  ['boxed string', new String('2')],
  ['boxed boolean', new Boolean(false)],
  ['even BigInt', 2n],
  ['odd BigInt', 3n],
  ['Symbol', Symbol('2')],
  ['function', () => 2],
]) {
  test(`AC-004 invalid input returns normally: ${label}`, () => {
    assert.strictEqual(classifyParity(value), invalid);
  });
}

test('AC-004 missing argument', () => {
  assert.strictEqual(classifyParity(), invalid);
});

test('AC-004 rejects objects without calling conversion hooks', () => {
  const calls = [];
  const value = Object.freeze({
    [Symbol.toPrimitive]() {
      calls.push('Symbol.toPrimitive');
      throw new Error('Unexpected coercion');
    },
    valueOf() {
      calls.push('valueOf');
      throw new Error('Unexpected coercion');
    },
    toString() {
      calls.push('toString');
      throw new Error('Unexpected coercion');
    },
  });
  assert.strictEqual(classifyParity(value), invalid);
  assert.deepStrictEqual(calls, []);
});

test('AC-004 rejects a Proxy without reading or writing its properties', () => {
  const accesses = [];
  const value = new Proxy({}, {
    get(target, key) {
      accesses.push(['get', key]);
      throw new Error('Unexpected property read');
    },
    set(target, key) {
      accesses.push(['set', key]);
      throw new Error('Unexpected property write');
    },
  });
  assert.strictEqual(classifyParity(value), invalid);
  assert.deepStrictEqual(accesses, []);
});

for (const [label, value, expected] of [
  ['integer-valued 2.0', 2.0, '偶数'],
  ['NaN', NaN, invalid],
  ['positive Infinity', Infinity, invalid],
  ['negative Infinity', -Infinity, invalid],
  ['largest finite number', Number.MAX_VALUE, invalid],
  ['lowest finite number', -Number.MAX_VALUE, invalid],
]) {
  test(`AC-005 numeric semantics: ${label}`, () => {
    assert.strictEqual(classifyParity(value), expected);
  });
}

test('AC-006 repeated calls and recovery after invalid input', () => {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    assert.deepStrictEqual(
      [3, 3, '2', 4].map(value => classifyParity(value)),
      ['奇数', '奇数', invalid, '偶数'],
    );
    assert.strictEqual(classifyParity(NaN), invalid);
    assert.strictEqual(classifyParity(-3), '奇数');
    assert.strictEqual(classifyParity(-0), '偶数');
  }
});

test('AC-006 does not modify caller-owned objects or collections', () => {
  const object = { value: 2, nested: { untouched: true } };
  const array = [2];
  const set = new Set([2]);
  const map = new Map([['value', 2]]);
  const objectDescriptors = Object.getOwnPropertyDescriptors(object);
  const nestedReference = object.nested;

  for (const value of [object, array, set, map, Object.freeze({ value: 2 })]) {
    assert.strictEqual(classifyParity(value), invalid);
  }

  assert.deepStrictEqual(Object.getOwnPropertyDescriptors(object), objectDescriptors);
  assert.strictEqual(object.nested, nestedReference);
  assert.deepStrictEqual(object, { value: 2, nested: { untouched: true } });
  assert.deepStrictEqual(array, [2]);
  assert.deepStrictEqual([...set], [2]);
  assert.deepStrictEqual([...map], [['value', 2]]);
  assert.strictEqual(classifyParity(4), '偶数');
});
