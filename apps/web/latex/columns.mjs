export function readGlobalColumns(preamble = '') {
  const options = /\\documentclass(?:\[([^\]]*)\])?\{[^{}]+\}/.exec(preamble)?.[1] ?? '';
  return options.split(',').map(option => option.trim()).includes('twocolumn') ? 2 : 1;
}

export function writeGlobalColumns(preamble = '', count = 1) {
  const columns = Number(count) === 2 ? 2 : 1;
  return String(preamble ?? '').replace(/\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/, (match, rawOptions, className) => {
    const options = String(rawOptions ?? '').split(',').map(option => option.trim()).filter(Boolean);
    const next = options.filter(option => option !== 'twocolumn');
    if (columns === 2) next.push('twocolumn');
    return '\\documentclass' + (next.length ? '[' + next.join(', ') + ']' : '') + '{' + className + '}';
  });
}
