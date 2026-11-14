import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../src/workflow-v5-b480fd61/greeting.mjs';

test('AC-GREET: exact greeting and trim', () => {
  assert.equal(greeting('Alice'), 'Hello, Alice!');
  assert.equal(greeting(' \tAlice\n '), 'Hello, Alice!');
});

test('AC-INVALID: rejects empty and non-string inputs', () => {
  for (const input of ['', ' \t\n ', undefined, null, 0, NaN, true, false,
    {}, [], ['Alice'], new String('Alice'), () => 'Alice', Symbol('Alice'), 0n]) {
    assert.throws(() => greeting(input), TypeError);
  }
  assert.throws(() => greeting(), TypeError);
});
