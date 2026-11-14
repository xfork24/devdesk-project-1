import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../src/workflow-v5-e201ba8d/greeting.mjs';

test('AC-GREET: formats and trims names while preserving internal spaces', () => {
  assert.strictEqual(greeting('Ada'), 'Hello, Ada!');
  assert.strictEqual(greeting('  Ada \t'), 'Hello, Ada!');
  assert.strictEqual(greeting(' A  B '), 'Hello, A  B!');
});

test('AC-INVALID: rejects empty names and non-string values', () => {
  for (const input of ['', ' \t\n', 42, null, undefined, {}, [], true, new String('Ada')]) {
    assert.throws(() => greeting(input), TypeError);
  }
  assert.throws(() => greeting(), TypeError);
});
