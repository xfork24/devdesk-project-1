import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyParity } from '../src/parity.mjs';

test('AC-001 signed integers', () => {
  for (const [value, expected] of [[2, '偶数'], [3, '奇数'], [-2, '偶数'], [-3, '奇数']]) {
    assert.strictEqual(classifyParity(value), expected, String(value));
  }
});

test('AC-002 signed zero', () => {
  for (const [label, value] of [['+0', 0], ['-0', -0]]) {
    assert.strictEqual(classifyParity(value), '偶数', label);
  }
});

test('AC-003 closed bounds', () => {
  for (const [value, expected] of [
    [-1000000, '偶数'], [1000000, '偶数'], [-999999, '奇数'],
    [999999, '奇数'], [-1000001, '输入无效'], [1000001, '输入无效'],
  ]) assert.strictEqual(classifyParity(value), expected, String(value));
});

test('AC-004 invalid values and missing argument', () => {
  for (const [label, value] of [
    ['fraction', 1.5], ['negative fraction', -1.5], ['numeric string', '2'],
    ['empty string', ''], ['true', true], ['false', false], ['null', null],
    ['undefined', undefined], ['array', []], ['Set', new Set([2])],
    ['Map', new Map([['n', 2]])], ['object', {}], ['boxed number', new Number(2)],
    ['BigInt', 2n], ['Symbol', Symbol('2')], ['function', () => 2],
  ]) assert.strictEqual(classifyParity(value), '输入无效', label);
  assert.strictEqual(classifyParity(), '输入无效', 'missing argument');
});

test('AC-004 AC-006 no coercion or mutation', () => {
  let conversions = 0;
  const fail = () => { conversions += 1; throw new Error('Unexpected coercion'); };
  const value = Object.freeze({ valueOf: fail, toString: fail, [Symbol.toPrimitive]: fail });
  const before = Object.getOwnPropertyDescriptors(value);
  assert.strictEqual(classifyParity(value), '输入无效');
  assert.strictEqual(conversions, 0);
  assert.deepStrictEqual(Object.getOwnPropertyDescriptors(value), before);
  const object = { n: 2 };
  assert.strictEqual(classifyParity(object), '输入无效');
  assert.deepStrictEqual(object, { n: 2 });
});

test('AC-005 numeric semantics', () => {
  assert.strictEqual(classifyParity(2.0), '偶数', '2.0');
  for (const [label, value] of [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]]) {
    assert.strictEqual(classifyParity(value), '输入无效', label);
  }
});

test('AC-006 repeat and recover', () => {
  for (let i = 0; i < 3; i += 1) {
    assert.deepStrictEqual([3, 3, '2', 4].map(value => classifyParity(value)),
      ['奇数', '奇数', '输入无效', '偶数']);
  }
});
