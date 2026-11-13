import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../src/workflow-v5-ac01481d/greeting.mjs';

test('AC-GREET', () => {
  for (const name of ['Ada', '  Ada  ', '\tAda\n']) {
    assert.equal(greeting(name), 'Hello, Ada!');
  }
  assert.equal(greeting('  Ada Lovelace  '), 'Hello, Ada Lovelace!');
});

test('AC-INVALID: empty names', () => {
  for (const name of ['', '   ', '\t\n']) {
    assert.throws(() => greeting(name), TypeError);
  }
});

test('AC-INVALID: primitive strings only', () => {
  assert.throws(() => greeting(), TypeError);
  for (const name of [undefined, null, 0, false, {}, [], Symbol('Ada'), 1n, new String('Ada')]) {
    assert.throws(() => greeting(name), TypeError);
  }
});
