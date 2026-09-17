import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { createRequestKey } from '../src/lib/request-key.ts';

test('request keys work without randomUUID on HTTP and with it on HTTPS', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    const secureCrypto = {
      randomUUID() {
        assert.equal(this, secureCrypto);
        return '09b29eb2-e751-45fc-805a-466a1bc8c3ec';
      },
    };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: secureCrypto });
    assert.equal(createRequestKey(), '09b29eb2-e751-45fc-805a-466a1bc8c3ec');

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
    });
    assert.equal(globalThis.crypto.randomUUID, undefined);
    const keys = Array.from({ length: 1000 }, () => createRequestKey());
    for (const key of keys) {
      assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    assert.equal(new Set(keys).size, keys.length);
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
});
