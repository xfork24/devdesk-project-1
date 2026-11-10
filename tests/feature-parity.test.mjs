import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyParity } from '../src/parity.mjs';

// Feature journeys use the real public entry point and explicit expected output.
// Task tests retain responsibility for the full invalid-type matrix.
test('Feature AC-001 AC-002 AC-004 AC-005 AC-006 caller journey and recovery', () => {
  const steps = [
    ['initial negative odd', -3, '奇数'],
    ['repeat', -3, '奇数'],
    ['reject text', '2', '输入无效'],
    ['retry as number', 2, '偶数'],
    ['reject fraction', 1.5, '输入无效'],
    ['recover with odd', 3, '奇数'],
    ['positive zero', 0, '偶数'],
    ['negative zero', -0, '偶数'],
    ['reject NaN', NaN, '输入无效'],
    ['integer-valued decimal', 2.0, '偶数'],
    ['reject positive infinity', Infinity, '输入无效'],
    ['recover negative even', -2, '偶数'],
    ['reject negative infinity', -Infinity, '输入无效'],
    ['final valid request', 4, '偶数'],
  ];
  for (const [label, input, expected] of steps) {
    assert.strictEqual(classifyParity(input), expected, label);
  }
  assert.strictEqual(classifyParity(), '输入无效', 'omitted request');
  assert.strictEqual(classifyParity(3), '奇数', 'recovery after omitted request');
});

test('Feature AC-003 AC-004 AC-006 transitions across both interval endpoints', () => {
  for (const [input, expected] of [
    [-1000001, '输入无效'], [-1000000, '偶数'], [-999999.5, '输入无效'],
    [-999999, '奇数'], [-999998, '偶数'],
    [999998, '偶数'], [999999, '奇数'], [999999.5, '输入无效'],
    [1000000, '偶数'], [1000001, '输入无效'], [1000000, '偶数'],
    [-1000000, '偶数'],
  ]) {
    assert.strictEqual(classifyParity(input), expected, `input ${input}`);
  }
});

test('Feature AC-001 AC-002 AC-003 every accepted integer has the specified result', () => {
  // Consecutive even/odd pairs form an independent oracle without repeating
  // the implementation's remainder or validity expression.
  for (let even = -1000000; even < 1000000; even += 2) {
    assert.strictEqual(classifyParity(even), '偶数', `even ${even}`);
    assert.strictEqual(classifyParity(even + 1), '奇数', `odd ${even + 1}`);
  }
  assert.strictEqual(classifyParity(1000000), '偶数', 'last endpoint');
});

test('Feature AC-004 AC-006 interleaved callers retain their inputs and recover', () => {
  let conversions = 0;
  const rejected = Object.freeze({
    [Symbol.toPrimitive]() {
      conversions += 1;
      throw new Error('Input must not be converted');
    },
  });
  const callerA = Object.freeze([3, rejected, -0, -3]);
  const callerB = Object.freeze(['2', 4, 1000001, -1000000]);
  const expectedA = ['奇数', '输入无效', '偶数', '奇数'];
  const expectedB = ['输入无效', '偶数', '输入无效', '偶数'];
  for (let round = 0; round < 3; round += 1) {
    for (let index = 0; index < callerA.length; index += 1) {
      assert.strictEqual(classifyParity(callerA[index]), expectedA[index]);
      assert.strictEqual(classifyParity(callerB[index]), expectedB[index]);
    }
  }
  assert.strictEqual(conversions, 0);
  assert.deepStrictEqual(callerA, [3, rejected, -0, -3]);
  assert.deepStrictEqual(callerB, ['2', 4, 1000001, -1000000]);
});
