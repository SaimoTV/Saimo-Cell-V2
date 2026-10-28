const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fnv1a, naAmostra } = require('../utils/amostra.ts');

// Valores do JavaScript de referência (worker.js, `amostrado`), rodado no node.
test('hash igual ao do servidor', () => {
  assert.equal(fnv1a('79a275ad-b783-488c-8e18-2439ff3aed1c'), 3670190157);
  assert.equal(fnv1a('db09f237-fffa-40c7-94c5-35eddcad6970'), 2926602047);
  assert.equal(fnv1a(''), 2166136261);
});
test('id em maiúsculas dá o mesmo hash', () => {
  assert.equal(fnv1a('79A275AD-B783-488C-8E18-2439FF3AED1C'), 3670190157);
});
test('quem entra a 5%', () => {
  assert.equal(naAmostra('79a275ad-b783-488c-8e18-2439ff3aed1c', 5), true);
  assert.equal(naAmostra('db09f237-fffa-40c7-94c5-35eddcad6970', 5), false);
  // Percentual inválido cai no padrão de 5%.
  assert.equal(naAmostra('79a275ad-b783-488c-8e18-2439ff3aed1c', NaN), true);
  assert.equal(naAmostra('db09f237-fffa-40c7-94c5-35eddcad6970', 100), true);
});
test('UTF-8 igual ao TextEncoder', () => {
  const ref = (s) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s.toLowerCase())) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  for (const s of ['ação', '日本', '😀x', 'ÉÇ']) assert.equal(fnv1a(s), ref(s));
});
