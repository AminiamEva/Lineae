// Compare probe-mixed.cjs output against independently extracted PDF coordinates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [previewPath, referencePath] = process.argv.slice(2);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const preview = await read(previewPath);
const reference = await read(referencePath);
assert.equal(preview.engine, reference.engine);
const lines = preview.textLines.flat();
const expected = reference.pdfLines.filter(line => !/^\d+$/.test(line.text));
assert.equal(lines.length, expected.length, 'body line count');
const comparisons = lines.map((line, i) => {
  const pdf = expected[i];
  return {line:i+1, expected:pdf.text, actual:line.text, same:line.text===pdf.text && line.page===pdf.page,
    width:(line.right-line.left)-(pdf.right-pdf.x), left:line.left-pdf.x,
    baseline:line.baseline-pdf.baseline,
    relative:(line.baseline-lines[0].baseline)-(pdf.baseline-expected[0].baseline)};
});
const box = preview.imageBox ?? preview.ruleCandidates[0]?.box;
const pdfBox = reference.bounds[1];
const boxDelta = Object.fromEntries(['x','y','width','height'].map(key => [key,box[key]-pdfBox[key]]));
console.log(JSON.stringify({engine:preview.engine, comparisons,boxDelta},null,2));
assert.ok(comparisons.every(r => r.same && Math.abs(r.width)<1 && Math.abs(r.left)<1 && Math.abs(r.relative)<0.5), 'body text, break, left edge, width or relative baseline');
assert.ok(Object.values(boxDelta).every(d=>Math.abs(d)<1),'float bounds');
