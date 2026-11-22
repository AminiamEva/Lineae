import test from 'node:test';
import assert from 'node:assert/strict';

import {readGlobalColumns, writeGlobalColumns} from '../apps/web/latex/columns.mjs';

test('reads and writes the documentclass twocolumn option', () => {
  assert.equal(readGlobalColumns('\\documentclass[a4paper]{article}'),1);
  assert.equal(readGlobalColumns('\\documentclass[a4paper, twocolumn]{article}'),2);
  assert.match(writeGlobalColumns('\\documentclass[a4paper]{article}',2),/\\documentclass\[a4paper, twocolumn\]\{article\}/);
  assert.match(writeGlobalColumns('\\documentclass[a4paper, twocolumn]{article}',1),/\\documentclass\[a4paper\]\{article\}/);
});
