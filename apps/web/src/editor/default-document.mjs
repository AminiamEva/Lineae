import {MARGIN_PRESETS} from '../../latex/geometry.mjs';
export function createDefaultDocument() {
  return [
    '\\documentclass[a4paper]{article}',
    '\\usepackage[margin=' + MARGIN_PRESETS.normal + ']{geometry}',
    '\\usepackage{amsmath}',
    '\\begin{document}',
    '',
    '\\end{document}',
    '',
  ].join('\n');
}
export const DEFAULT_DOCUMENT_SOURCE = createDefaultDocument();
