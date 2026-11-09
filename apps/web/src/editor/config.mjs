function parseScalar(value) {
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map(item => parseScalar(item.trim())) : [];
  }
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (value === 'null' || value === '~' || value === '') return null;
  return value;
}

export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const match = line.trim().match(/^([^:]+):(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (value === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else parent[key] = parseScalar(value);
  }
  return root;
}

function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  return String(value);
}

export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return '[' + value.map(formatScalar).join(', ') + ']';
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => {
      if (Array.isArray(entry)) return pad + key + ': ' + toYaml(entry);
      if (entry && typeof entry === 'object') return pad + key + ':\n' + toYaml(entry, indent + 2);
      return pad + key + ': ' + formatScalar(entry);
    }).join('\n');
  }
  return formatScalar(value);
}

export function mergeConfig(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeConfig(base?.[key] ?? {}, value)
      : value;
  }
  return result;
}
