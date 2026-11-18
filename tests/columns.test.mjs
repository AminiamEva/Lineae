import test from 'node:test';
import assert from 'node:assert/strict';

import {readGlobalColumns, writeGlobalColumns} from '../apps/web/latex/columns.mjs';
import {importBlocks} from '../apps/web/latex/blocks.mjs';
import {serialize} from '../apps/web/src/editor/latex-codec.js';

test('reads and writes the documentclass twocolumn option', () => {
  assert.equal(readGlobalColumns('\\documentclass[a4paper]{article}'),1);
  assert.equal(readGlobalColumns('\\documentclass[a4paper, twocolumn]{article}'),2);
  assert.match(writeGlobalColumns('\\documentclass[a4paper]{article}',2),/\\documentclass\[a4paper, twocolumn\]\{article\}/);
  assert.match(writeGlobalColumns('\\documentclass[a4paper, twocolumn]{article}',1),/\\documentclass\[a4paper\]\{article\}/);
});

test('round-trips a local multicols block', () => {
  const source='\\begin{multicols}{2}\nInside columns.\n\\end{multicols}';
  const [node]=importBlocks(source);
  assert.equal(node.type,'multiColumn');
  assert.equal(node.attrs.count,2);
  assert.match(serialize(node),/\\begin\{multicols\}\{2\}/);
  assert.match(serialize(node),/Inside columns\./);
});
