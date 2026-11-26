import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLibrary } from '../apps/web/src/tikz/components/symbols-meta.js';
import * as comp from '../apps/web/src/tikz/components/components.js';
import { TikzEditor } from '../apps/web/src/tikz/controllers/tikzEditor.js';

const defs = parseLibrary(readFileSync(new URL('../apps/web/assets/tikz-symbols.svg', import.meta.url), 'utf8')).defs;

function importer() {
  const editor = new TikzEditor();
  editor.componentDefs = defs;
  editor.recomputeSnap = () => {};
  editor.render = () => {};
  return editor;
}

test('path labels export CircuiTikZ-Designer l / l_ options with distance and color', () => {
  const def = defs.find(d => d.tikz === 'capacitor');
  const capacitor = new comp.PathComponent(def, 0, 0);
  capacitor.label = 'C_1';
  assert.match(capacitor.toTikZ(v => v, v => v), /to\[capacitor, l=\$C_1\$\]/);
  capacitor.labelSide = true;
  capacitor.labelDistance = 0.3;
  assert.match(capacitor.toTikZ(v => v, v => v), /l_=\{\$C_1\$\}/);
  assert.match(capacitor.toTikZ(v => v, v => v), /label distance=0\.3cm/);
  capacitor.labelColor = '#ff0000';
  const code = capacitor.toTikZ(v => v, v => v);
  assert.match(code, /\\textcolor\[HTML\]\{ff0000\}\{\$C_1\$\}/);
});

test('node labels export position and distance as a label option', () => {
  const def = defs.find(d => d.tikz === 'npn');
  const transistor = new comp.NodeSymbol(def, 0, 0);
  transistor.label = 'Q_1';
  assert.match(transistor.toTikZ(v => v, v => v), /label=\{\$Q_1\$\}/);
  transistor.labelPosition = 'below';
  transistor.labelDistance = 0.2;
  assert.match(transistor.toTikZ(v => v, v => v), /label=\{\[label distance=0\.2cm\]270:\$Q_1\$\}/);
});

test('import keeps path label side, distance and color', () => {
  const editor = importer();
  editor.importTikz(String.raw`\begin{tikzpicture}
\draw (0,0) to[capacitor, l_={\textcolor[HTML]{ff0000}{$C_1$}}, label distance=0.3cm] (2,0);
\end{tikzpicture}`);
  const capacitor = editor.items.find(item => item.def?.tikz === 'capacitor');
  assert.ok(capacitor, 'capacitor imported');
  assert.equal(capacitor.label, 'C_1');
  assert.equal(capacitor.labelSide, true);
  assert.equal(capacitor.labelDistance, 0.3);
  assert.equal(capacitor.labelColor, '#ff0000');
  assert.deepEqual(capacitor.options, [], 'label options are not mistaken for variant options');
  assert.match(capacitor.toTikZ(v => v, v => v), /l_=\{\\textcolor\[HTML\]\{ff0000\}\{\$C_1\$\}\}, label distance=0\.3cm/);
});

test('import keeps default path label and node label position', () => {
  const editor = importer();
  editor.importTikz(String.raw`\begin{tikzpicture}
\draw (0,0) to[capacitor, l=$C_2$] (2,0);
\node[npn, label={[label distance=0.2cm]270:$Q_1$}] at (3,0) {};
\end{tikzpicture}`);
  const capacitor = editor.items.find(item => item.def?.tikz === 'capacitor');
  assert.equal(capacitor.label, 'C_2');
  assert.equal(capacitor.labelSide, false);
  assert.equal(capacitor.labelDistance, null);
  const transistor = editor.items.find(item => item.def?.tikz === 'npn');
  assert.equal(transistor.label, 'Q_1');
  assert.equal(transistor.labelPosition, 'below');
  assert.equal(transistor.labelDistance, 0.2);
  assert.deepEqual(transistor.options, [], 'label option is stripped from variant options');
  assert.match(transistor.toTikZ(v => v, v => v), /^\\node\[npn, label=\{\[label distance=0\.2cm\]270:\$Q_1\$\}\]/);
});

test('import/export preserves tikzpicture options, ctikzset and component extras', () => {
  const editor = importer();
  editor.importTikz(String.raw`\begin{tikzpicture}[transform shape, scale=1.2]
\ctikzset{voltages=american}
\draw (0,0) to[capacitor, /tikz/circuitikz/bipoles/length=1.12cm, l={$C_1$}] (2,0);
\end{tikzpicture}`);
  assert.deepEqual(editor.tikzEnvironment, ['transform shape', 'scale=1.2']);
  assert.deepEqual(editor.tikzCtikzset, ['voltages=american']);
  const capacitor = editor.items.find(item => item.def?.tikz === 'capacitor');
  assert.match(capacitor.toTikZ(v => v, v => v), /\/tikz\/circuitikz\/bipoles\/length=1\.12cm/);
  const code = editor.exportCode();
  assert.match(code, /^\\ctikzset\{voltages=american\}\n\\begin\{tikzpicture\}\[transform shape, scale=1\.2\]/);
  assert.match(code, /to\[capacitor, \/tikz\/circuitikz\/bipoles\/length=1\.12cm, l=\$C_1\$\]/);
});

test('import reads name= options and named-anchor coordinates', () => {
  const editor = importer();
  editor.importTikz(String.raw`\begin{tikzpicture}
\node[circ, name=N4] at (2, 2){};
\draw (N4) to[short] (3,2);
\end{tikzpicture}`);
  const circ = editor.items.find(item => item.def?.tikz === 'circ');
  assert.ok(circ, 'circ node with name= option is imported');
  const wire = editor.items.find(item => item.kind === 'wire');
  assert.deepEqual(wire.pts[0], { x: circ.x, y: circ.y }, 'wire resolves the name= node');
});

test('import maps every label anchor to a position and export angle', () => {
  const cases = [
    ['north', 'below', '270'],
    ['south', 'above', '90'],
    ['east', 'left', '180'],
    ['west', 'right', '0'],
    ['north east', 'below left', '225'],
    ['north west', 'below right', '315'],
    ['south east', 'above left', '135'],
    ['south west', 'above right', '45'],
  ];
  for (const [anchor, position, angle] of cases) {
    const editor = importer();
    editor.importTikz(String.raw`\begin{tikzpicture}\node[circ](N) at (1,1){} node[anchor=${anchor}] at (N.text){$X$};\end{tikzpicture}`);
    const circ = editor.items.find(item => item.def?.tikz === 'circ');
    assert.equal(circ.labelPosition, position, 'position for anchor ' + anchor);
    const code = circ.toTikZ(v => v, v => v);
    if (angle === '90') assert.match(code, /label=\{\$X\$\}/, 'default above for anchor ' + anchor);
    else assert.match(code, new RegExp('label=\\{' + angle + ':\\$X\\$\\}'), 'angle for anchor ' + anchor);
  }
});

test('import keeps named nodes, anchor references and chained label nodes', () => {
  const editor = importer();
  editor.importTikz(String.raw`\begin{tikzpicture}
\node[ground](N1) at (3, 7){} node[anchor=south] at (N1.text){$\text{AI GND}$};
\node[circ](N2) at (8, 7){} node[anchor=south] at (N2.north){$\text{AI 1}$};
\node[circ](N3) at (3.75, 5){} node[anchor=north east] at (N3.text){$\text{AI 0}$};
\draw (N1) to[short] (N2);
\end{tikzpicture}`);
  const ground = editor.items.find(item => item.def?.tikz === 'ground');
  const circs = editor.items.filter(item => item.def?.tikz === 'circ');
  assert.ok(ground, 'named ground node is imported');
  assert.equal(ground.label, '\\text{AI GND}', 'chained label is attached to the ground');
  assert.equal(ground.labelPosition, 'above');
  assert.equal(circs.length, 2, 'both named circ nodes are imported');
  const circ1 = circs.find(item => item.label === '\\text{AI 1}');
  const circ0 = circs.find(item => item.label === '\\text{AI 0}');
  assert.ok(circ1 && circ0, 'both attached node labels are imported');
  assert.equal(circ1.labelPosition, 'above');
  assert.equal(circ0.labelPosition, 'below left');
  assert.match(circ0.toTikZ(v => v, v => v), /label=\{225:\$\\text\{AI 0\}\$\}/, 'north-east anchor exports the south-west angle');
  const wires = editor.items.filter(item => item.kind === 'wire');
  assert.equal(wires.length, 1, 'a wire between named nodes is imported');
  assert.deepEqual(wires[0].pts[0], { x: ground.x, y: ground.y }, 'wire endpoint resolves the node name');
  assert.deepEqual(wires[0].pts[1], { x: circ1.x, y: circ1.y }, 'wire endpoint resolves the second node name');
});

