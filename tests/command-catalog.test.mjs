import test from 'node:test';
import assert from 'node:assert/strict';
import { mathCommandCatalog } from '../apps/web/latex/command-catalog.mjs';

// Independent acceptance list: do not derive these expectations from the catalog.
const expected = {
  relation: 'leq geq neq approx equiv sim simeq propto ll gg',
  set: 'in notin ni subset supset subseteq supseteq cup cap setminus emptyset varnothing',
  arrow: 'to leftarrow rightarrow leftrightarrow Leftarrow Rightarrow Leftrightarrow mapsto uparrow downarrow',
  operator: 'sin cos tan cot sec csc sinh cosh tanh log ln exp lim sup inf max min det gcd',
  greek: 'alpha beta gamma delta epsilon varepsilon theta vartheta lambda mu nu xi pi rho sigma tau phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega',
};

test('contains exactly the requested commands, once each, in their designated categories', () => {
  const names = mathCommandCatalog.map(entry => entry.name);
  assert.equal(names.length, 82);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), Object.values(expected).join(' ').split(' ').sort());
  for (const [category, commands] of Object.entries(expected)) {
    assert.deepEqual(mathCommandCatalog.filter(entry => entry.category === category).map(entry => entry.name).sort(), commands.split(' ').sort());
  }
});

test('entries contain only explicit commands, bilingual labels and exact package declarations', () => {
  for (const entry of mathCommandCatalog) {
    assert.deepEqual(Object.keys(entry).sort(), ['category','labels','latex','name','packages']);
    assert.match(entry.name, /^[A-Za-z]+$/);
    assert.equal(entry.latex, '\\' + entry.name);
    assert.ok(Object.hasOwn(expected, entry.category));
    assert.deepEqual(Object.keys(entry.labels).sort(), ['en','zh']);
    assert.equal(typeof entry.labels.zh, 'string');
    assert.equal(typeof entry.labels.en, 'string');
    assert.match(entry.labels.zh, /[\u3400-\u9fff]/);
    assert.match(entry.labels.en, /[A-Za-z]/);
    assert.ok(entry.labels.zh.trim() && entry.labels.en.trim());
    assert.deepEqual(entry.packages, entry.name === 'varnothing' ? ['amssymb'] : []);
  }
});
