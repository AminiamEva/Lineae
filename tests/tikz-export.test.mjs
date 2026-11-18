import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapController, SnapPoint, PX_PER_CM } from '../apps/web/src/tikz/controllers/snapDrag.js';
import * as comp from '../apps/web/src/tikz/components/components.js';
import { parseLibrary, BASIC_COMPONENTS, GROUP_LABELS } from '../apps/web/src/tikz/components/symbols-meta.js';
import { exportTikz } from '../apps/web/src/tikz/controllers/exportController.js';
import { readFileSync } from 'node:fs';

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg"><metadata><component type="node" display="Ground" tikzName="ground" group="Grounds and supply voltages" class=" ground">
<variant for="node_ground" viewBox="0 0 29.34 19.51" x="-0.70" y="-15.24"/></component>
<component type="path" display="Resistor" tikzName="R" group="Miscellaneous" class="resistor">
<variant for="path_americanResistor" viewBox="0 0 44.46 16.94" x="-22.23" y="0"/><pin name="START" x="-21.16" y="0"/><pin name="END" x="21.16" y="0"/></component>
<component type="open" display="Opening switch" tikzName="ospst" group="Switches, buttons and jumpers" class="switch">
<variant for="open_switch" viewBox="0 0 44.46 16.94" x="-22.23" y="0"/><pin name="START" x="-21.16" y="0"/><pin name="END" x="21.16" y="0"/></component>
</metadata></svg>`;

test('parseLibrary extracts defs, groups and order', () => {
  const { defs, order } = parseLibrary(FIXTURE);
  assert.equal(defs.length, 3);
  assert.deepEqual(order, ['Grounds and supply voltages', 'Miscellaneous', 'Switches, buttons and jumpers']);
  const r = defs.find(d => d.kind === 'path');
  assert.equal(r.pins.length, 2);
  assert.ok(Math.abs(r.pinDist - 42.32) < 0.01);
  const g = defs.find(d => d.kind === 'node');
  assert.ok(Math.abs(g.anchor[1] + 15.24) < 0.01);
});

test('snap priority: terminal beats grid', () => {
  const s = new SnapController();
  s.register([new SnapPoint(3, 2, { uid: 1 })]);
  const p = s.snap({ x: 4, y: 3 });
  assert.equal(p.x, 3); assert.equal(p.y, 2);
});

test('export: library path with pins, node anchor, rect shape, named wire', () => {
  const R = new comp.PathComponent({ tikz: 'R', id: 'path_americanResistor', pins: [{ x: -21.16, y: 0 }, { x: 21.16, y: 0 }], pinDist: 42.32, viewBox: [0, 0, 44.46, 16.94] }, 0, 0);
  R.label = 'R_1';
  const g = new comp.NodeSymbol({ tikz: 'ground', id: 'node_ground', anchor: [-0.7, -15.24] }, 60, 40);
  const box = new comp.RectComponent({ tikz: 'rectangle', w: PX_PER_CM, h: PX_PER_CM * 0.7 }, 120, 0);
  box.label = 'H(s)';
  const w = new comp.Wire([{ x: 42.32, y: 0 }, { x: 60, y: 39 }]);
  w.setEnds({ comp: R, ti: 1 }, { comp: g, ti: 0 });
  const code = exportTikz([R, g, box, w], { widthFraction: 0.6, textwidthCm: 15 });
  assert.match(code, /to\[R, l=\$R_1\$\]/);
  assert.match(code, /node\[ground\]/);
  assert.match(code, /draw, rectangle, minimum width=1\.000cm/);
  assert.match(code, /\\coordinate \(t\d+_1\)/);
});

test('real library: 402 defs, finite pins and named anchors', () => {
  const text = readFileSync(new URL('../apps/web/assets/tikz-symbols.svg', import.meta.url), 'utf8');
  const { defs, order } = parseLibrary(text);
  assert.equal(defs.length, 402);
  assert.ok(order.length >= 15);
  for (const d of defs) {
    assert.ok(d.tikz, 'tikz name present: ' + d.name);
    assert.ok(d.cat, 'group present: ' + d.name);
    assert.ok(d.variants.length > 0, 'variant present: ' + d.name);
    for (const variant of d.variants) {
      for (const pin of variant.pins) {
        assert.ok(Number.isFinite(pin.x) && Number.isFinite(pin.y), 'finite pin coordinate: ' + d.name + '/' + pin.name);
      }
    }
  }
  const npn = defs.find(d => d.name === 'NPN');
  assert.deepEqual(npn.pins.map(pin => pin.name), ['B', 'C', 'E']);
  assert.ok(npn.variants.find(variant => variant.options.includes('bodydiode')).pins.length > 3);
  const transformer = defs.find(d => d.name === 'Transformer');
  assert.ok(transformer.enums.some(enumDef => enumDef.options.some(option => option.name === 'cute')));
});

test('node and path components expose every named pin as snap points', () => {
  const defs = parseLibrary(readFileSync(new URL('../apps/web/assets/tikz-symbols.svg', import.meta.url), 'utf8')).defs;
  const npn = defs.find(d => d.name === 'NPN');
  const node = new comp.NodeSymbol(npn, 100, 100);
  assert.equal(node.terminals().length, 3);
  assert.ok(node.terminals().some(point => point.name === 'B'));
  const vco = defs.find(d => d.name === 'VCO');
  const path = new comp.PathComponent(vco, 50, 50);
  assert.equal(path.terminals().length, 2);
  path.options = ['box'];
  assert.ok(path.terminals().length > 2);
  const code = path.toTikZ(x => x, y => y);
  assert.match(code, /^\\draw \(50,50\) to\[vco/);
  assert.match(code, /\);$/);
});

test('all 402 library definitions construct snap points and TikZ commands', () => {
  const defs = parseLibrary(readFileSync(new URL('../apps/web/assets/tikz-symbols.svg', import.meta.url), 'utf8')).defs;
  let nodes = 0, paths = 0;
  for (const def of defs) {
    if (def.kind === 'node') {
      const node = new comp.NodeSymbol(def, 0, 0);
      assert.ok(node.terminals().length >= 1, 'node terminals: ' + def.name);
      assert.match(node.toTikZ(value => value, value => value), /^\\node\[/);
      nodes++;
    } else if (def.kind === 'path') {
      const path = new comp.PathComponent(def, 0, 0);
      assert.ok(path.terminals().length >= 2, 'path terminals: ' + def.name);
      assert.match(path.toTikZ(value => value, value => value), /^\\draw /);
      for (const point of path.adjustPoints()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      paths++;
    }
  }
  assert.equal(nodes, 153);
  assert.equal(paths, 249);
});
