import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlock} from '../../apps/web/latex/blocks.mjs';
import {serialize} from '../../apps/web/src/editor/latex-codec.js';

test('longtable keeps section boundaries and patches only the edited body cell', () => {
  const source = String.raw`\begin{longtable}{ll}
First & First value \\
\endfirsthead
Next & Next value \\
\endhead
Foot & Continued \\
\endfoot
Last & Finished \\
\endlastfoot
Row & Original \\
\end{longtable}`.replace(/\n/g, '\r\n');
  const table = importBlock(source);
  assert.equal(table.type, 'table');
  assert.deepEqual(table.attrs.longtable.sections, {firsthead:[0,1], head:[1,2], foot:[2,3], lastfoot:[3,4]});
  table.content.at(-1).content[1].content[0].content[0].text = 'Changed';
  assert.equal(serialize(table), source.replace('Original', 'Changed'));
});
