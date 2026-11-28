/**
 * Conservative source model for ONE display's contents (no $/$$/\[ wrappers).
 * Parse the supported structural commands, symbols, scripts and aligned cells
 * without expanding macros or changing category codes.
 *
 * Ranges are half-open UTF-16 source offsets; slot edit offsets are relative to
 * slot.raw. Slots describe source fields, not inferred glyph/empty-field boxes.
 * Each slot carries its containing owner's tag and a role. In particular,
 * empty fraction arguments contain NO instrumentation or placeholder material.
 *
 * Projection is for insertion INSIDE a single LuaLaTeX display. Assignments
 * are local to \begingroup, restore the parent attribute after each atom, and
 * do not wrap ordinary atoms in math groups (which would change math classes).
 * Ungrouped script arguments acquire projection-only braces so assignments
 * cannot become the script argument. Attribute 65000 must be reserved by the
 * caller. This module does not configure a Lua callback or infer coordinates.
 *
 * IDs reconcile against one authentic prior snapshot: unchanged source ranges
 * first, then same-kind nodes in equal-sized gaps within the same owner field.
 * This preserves common local edits, not identity through arbitrary moves or
 * ambiguous repeated text. Retain snapshots for exact undo identity. There is
 * no global document/version tracking; callers must supply the current snapshot.
 */

import {mathCommandCatalog} from '../../../latex/command-catalog.mjs';
import {parseDelimiterPair} from '../../../latex/delimiters.mjs';

const snapshots = new WeakMap();
const segmenter = new Intl.Segmenter('und', {granularity: 'grapheme'});
const ordinary = /^[\p{L}\p{N}]\p{M}*$/u;
const operator = /^[+=,.:!?<>/|()\[\]-]$/u;
const editable = /^[\p{L}\p{N}\p{M}+=,.:!?<>/|()\[\] \t\r\n-]*$/u;
const largeOperators=['int','iint','iiint','oint','oiint','sum','prod'];
// Only single-symbol catalog entries here. Function names may paint multiple
// glyphs while representing one operator and need different caret handling.
const symbols = new Set([
  ...mathCommandCatalog.filter(entry=>entry.category!=='operator').map(entry=>entry.latex),
  ...largeOperators.map(command=>'\\'+command),
]);
const mathWrappers = new Set(['\\boxed','\\mathord','\\mathrm','\\mathbf','\\mathit','\\mathsf',
  '\\mathtt','\\mathcal','\\mathscr','\\mathbb','\\mathfrak']);
const mathStyle=/^\\(display|text|script|scriptscript)style(?![A-Za-z])/;

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function unicode(source) {
  const to8 = Array(source.length + 1).fill(null), to16 = [];
  let bytes = 0;
  to8[0] = 0;
  to16[0] = 0;
  for (let i = 0; i < source.length;) {
    const point = source.codePointAt(i);
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new SyntaxError('Unpaired UTF-16 surrogate');
    }
    const width = point > 0xffff ? 2 : 1;
    const count = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    for (let n = 1; n < count; n++) to16[bytes + n] = null;
    bytes += count;
    i += width;
    to8[i] = bytes;
    to16[bytes] = i;
  }
  return {to8, to16};
}

function parse(source) {
  let at = 0;
  const protectedRanges = [], singleArguments = [];
  const graphemes = new Map([...segmenter.segment(source)].map(s => [s.index, s.segment]));
  function fail(message, offset = at) {
    const error = new SyntaxError(message);
    error.offset = offset;
    throw error;
  }
  function protect(from16, to16, kind) {
    protectedRanges.push({from16, to16, kind});
  }
  function skipStyle() {
    const style=mathStyle.exec(source.slice(at));
    if(!style)return false;
    const start=at;
    at+=style[0].length;
    protect(start,at,'command');
    return true;
  }
  function trivia() {
    while (at < source.length) {
      if (/[ \t\r\n]/.test(source[at])) {
        at++;
      } else if (source[at] === '%') {
        const start = at++;
        while (at < source.length && !/[\r\n]/.test(source[at])) at++;
        protect(start, at, 'comment');
      } else if(source[at]==='\\'){
        const annotation=/^\\(?:label[ \t]*\{[^{}\\%\s]+\}|tag\*?[ \t]*\{[^{}\\%\r\n]*\}|(?:notag|nonumber)(?![A-Za-z]))/.exec(source.slice(at));
        if(!annotation)break;
        const start=at;at+=annotation[0].length;
        protect(start,at,'annotation');
      } else break;
    }
  }
  function field(role, depth, single = false) {
    trivia();
    if (source[at] === '{') {
      protect(at, at + 1, 'delimiter');
      const from16 = ++at;
      const children = sequence(depth + 1, '}');
      const to16 = at;
      if (source[at] !== '}') fail('Unclosed group');
      protect(at, ++at, 'delimiter');
      return {role, from16, to16, grouped: true, children};
    }
    if (!single) fail('Expected a braced argument');
    const from16 = at;
    const child = atom(depth + 1, false);
    if (child.kind !== 'token'||!ordinary.test(source.slice(from16,at)))
      fail('Ungrouped scripts require a letter or digit', from16);
    const result = {role, from16, to16: at, grouped: false, single: true, children: [child]};
    singleArguments.push(result);
    return result;
  }
  function atom(depth, scripts = true) {
    if (depth > 128) fail('Math nesting exceeds 128');
    const from16 = at;
    let node;
    if (source[at] === '{') {
      const body = field('body', depth);
      node = {kind: 'group', from16, fields: [body]};
    } else if (source[at] === '\\') {
      const command = /^\\[A-Za-z]+/.exec(source.slice(at))?.[0];
      const matrix = command==='\\begin'&&/^\\begin\{(matrix|[pbBvV]matrix|aligned(?:at)?|gathered|align(?:at)?\*?|flalign\*?|gather\*?|multline\*?|eqnarray\*?|split|cases|dcases|rcases|drcases)\}/.exec(source.slice(at));
      if(command==='\\left'){
        function delimiter(prefix) {
          const start=at;
          at+=prefix.length;trivia();
          const spelling=/^(?:\\(?:[{}|]|(?:langle|rangle|lvert|rvert|lVert|rVert|vert|Vert|lfloor|rfloor|lceil|rceil|lbrace|rbrace)(?![A-Za-z]))|[()[\].|])/.exec(source.slice(at))?.[0];
          if(!spelling)fail('Unsupported fence delimiter');
          at+=spelling.length;protect(start,at,'delimiter');
        }
        delimiter('\\left');
        const start=at,children=[];
        while(true){
          trivia();
          if(at===source.length)fail('Unclosed fence');
          if(/^\\right(?![A-Za-z])/.test(source.slice(at)))break;
          children.push(atom(depth+1));
        }
        const end=at;
        delimiter('\\right');
        node={kind:'fence',from16,fields:[{role:'body',from16:start,to16:end,grouped:true,children}]};
      } else if(matrix){
        at+=matrix[0].length;protect(from16,at,'command');
        if(/^align(?:ed)?at\*?$/.test(matrix[1])){
          const count=/^[ \t\r\n]*\{[1-9]\d*\}/.exec(source.slice(at));
          if(!count)fail('Expected an alignment pair count');
          protect(at,at+count[0].length,'delimiter');
          at+=count[0].length;
        }
        node={kind:'matrix',command:matrix[1],from16,fields:[]};
        let row=0,column=0;
        while(true){
          const start=at,children=[];
          while(true){
            trivia();
            if(at===source.length||source[at]==='&'||source.startsWith('\\\\',at)||source.startsWith('\\end{',at))break;
            if(!skipStyle())children.push(atom(depth+1));
          }
          const cell={kind:'cell',from16:start,to16:at,afterGroup:/^align/.test(matrix[1])&&!children.length,
            fields:[{role:'cell',from16:start,to16:at,grouped:false,children}]};
          node.fields.push({role:`cell.${row}.${column}`,from16:start,to16:at,grouped:false,children:[cell]});
          if(source[at]==='&'){protect(at,++at,'delimiter');column++;continue;}
          if(source.startsWith('\\\\',at)){
            protect(at,at+2,'delimiter');at+=2;
            if(/^[ \t]*\[/.test(source.slice(at)))fail('Matrix row spacing is not supported');
            row++;column=0;continue;
          }
          const close=`\\end{${matrix[1]}}`;
          if(!source.startsWith(close,at))fail('Unclosed matrix environment');
          protect(at,at+close.length,'command');at+=close.length;break;
        }
      } else if(symbols.has(command)){
        at+=command.length;protect(from16,at,'command');
        node={kind:'token',from16,fields:[],nucleusTo16:at};
      } else if(command==='\\text'){
        at+=command.length;protect(from16,at,'command');trivia();
        if(source[at]!=='{')fail('Expected a braced text argument');
        protect(at,++at,'delimiter');
        const start=at,children=[];
        while(source[at]!=='}'){
          const token=graphemes.get(at);
          if(!token||/[\\{}%$#&_^~]/.test(token))fail('Unsupported math text token');
          const from=at;at+=token.length;
          if(token.trim())children.push({kind:'token',from16:from,to16:at,nucleusTo16:at,fields:[]});
        }
        const end=at;protect(at,++at,'delimiter');
        node={kind:'wrapper',command,from16,fields:[{role:'body',from16:start,to16:end,grouped:true,children}]};
      } else if(mathWrappers.has(command)){
        at+=command.length;protect(from16,at,'command');
        node={kind:'wrapper',command,from16,fields:[field('body',depth)]};
      } else {
        if (command !== '\\frac' && command !== '\\sqrt') fail('Unsupported control sequence');
        at += command.length;
        protect(from16, at, 'command');
        node = {kind: command.slice(1), from16, fields: []};
        if(command==='\\sqrt'){
          trivia();
          if(source[at]==='['){
            protect(at,++at,'delimiter');
            const start=at,children=sequence(depth+1,']'),end=at;
            if(source[at]!==']')fail('Unclosed root degree');
            protect(at,++at,'delimiter');
            node.fields.push({role:'degree',from16:start,to16:end,grouped:true,children});
          }
        }
        for (const role of command === '\\frac' ? ['numerator', 'denominator'] : ['radicand']) {
          node.fields.push(field(role, depth));
        }
      }
    } else {
      const token = graphemes.get(at);
      if (!token || (!ordinary.test(token)&&!operator.test(token))) fail('Unsupported math token');
      at += token.length;
      node = {kind: 'token', from16, fields: [], nucleusTo16: at};
    }
    if (scripts) {
      const roles = new Set();
      while (true) {
        const beforeTrivia = at;
        trivia();
        const marker = source[at];
        if (marker !== '^' && marker !== '_') {
          at = beforeTrivia;
          break;
        }
        const role = marker === '^' ? 'superscript' : 'subscript';
        if (roles.has(role)) fail('Duplicate script');
        roles.add(role);
        protect(at, ++at, 'delimiter');
        node.fields.push(field(role, depth, true));
      }
    }
    node.to16 = at;
    return node;
  }
  function sequence(depth, close) {
    const children = [];
    while (true) {
      trivia();
      if (at === source.length || source[at] === close) break;
      if(!skipStyle())children.push(atom(depth));
    }
    return children;
  }
  const root = {
    kind: 'formula', from16: 0, to16: source.length,
    fields: [{role: 'body', from16: 0, to16: source.length, grouped: false, children: sequence(0)}],
  };
  // Trivia can be inspected twice while looking ahead for scripts.
  const uniqueProtected = [...new Map(protectedRanges.map(r => [`${r.from16}:${r.to16}`, r])).values()];
  return {root, protectedRanges: uniqueProtected, singleArguments};
}

function reconcile(root, source, prior, firstTag) {
  let nextId = Math.max(prior?.nextId??1,firstTag);
  let prefix = 0, oldEnd = prior?.source.length ?? 0, newEnd = source.length;
  if (prior) {
    while (prefix < oldEnd && prefix < newEnd && prior.source[prefix] === source[prefix]) prefix++;
    while (oldEnd > prefix && newEnd > prefix && prior.source[oldEnd - 1] === source[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
  }
  const delta = newEnd - oldEnd;
  function unchanged(old, node) {
    const before = old.to16 <= prefix;
    const after = old.from16 >= oldEnd;
    const shift = before ? 0 : after ? delta : null;
    return shift !== null && old.kind === node.kind &&
      old.from16 + shift === node.from16 && old.to16 + shift === node.to16 &&
      prior.source.slice(old.from16, old.to16) === source.slice(node.from16, node.to16);
  }
  function visit(node, old, path) {
    node.tag = old?.tag ?? nextId++;
    node.id = `math-${node.tag}`;
    node.path = path;
    for (const field of node.fields) {
      const oldField = old?.fields.find(f => f.role === field.role);
      const oldChildren = oldField?.children ?? [];
      const matches = new Map(), used = new Set();
      for (let i = 0; i < field.children.length; i++) {
        const index = oldChildren.findIndex((candidate, j) => !used.has(j) && unchanged(candidate, field.children[i]));
        if (index >= 0) {
          matches.set(i, index);
          used.add(index);
        }
      }
      // Only reconcile changed siblings positionally between ordered anchors.
      const anchors = [[-1, -1], ...matches, [field.children.length, oldChildren.length]];
      for (let a = 1; a < anchors.length; a++) {
        const [left, oldLeft] = anchors[a - 1], [right, oldRight] = anchors[a];
        if (right - left !== oldRight - oldLeft || oldRight <= oldLeft) continue;
        for (let i = left + 1; i < right; i++) {
          const j = oldLeft + i - left;
          if (!used.has(j) && field.children[i].kind === oldChildren[j].kind) {
            matches.set(i, j);
            used.add(j);
          }
        }
      }
      field.children.forEach((child, i) => visit(child, oldChildren[matches.get(i)], `${path}/${field.role}/${i}`));
    }
  }
  visit(root, prior?.tree?.root, 'formula');
  return nextId;
}

function instrument(source, root, attribute) {
  const events = new Map();
  function insert(at, text) {
    events.set(at, (events.get(at) ?? '') + text);
  }
  // TeX consumes this space as the number terminator, even when the next
  // original token is a digit. rtex's math allowlist rejects \relax here.
  const tag = value => `\\attribute${attribute}=${value} `;
  const macro = value => '\\LineaeNativeCell'+String(value).replace(/\d/g,digit=>String.fromCharCode(65+Number(digit)));
  insert(0, `\\begingroup${tag(root.tag)}`);
  function children(owner) {
    for (const field of owner.fields) {
      if (field.single) insert(field.from16, '{');
      for (const child of field.children) {
        if(child.afterGroup){
          // amsmath closes a cell's internal group before its math boundary.
          // Assign on that group exit so a genuinely empty cell has its own
          // owner without adding a visible or spacing-changing math node.
          insert(owner.from16,`\\def${macro(child.tag)}{${tag(child.tag)}}`);
          insert(child.from16,`\\aftergroup${macro(child.tag)} `);
        }else insert(child.from16, tag(child.tag));
        children(child);
        // LuaTeX records a cell's effective attribute when ending its math
        // boundary. In an empty cell in particular, keep the cell owner in
        // force through the alignment separator.
        if(child.kind!=='cell')insert(child.to16, tag(owner.tag));
      }
      if (field.single) insert(field.to16, '}');
    }
  }
  children(root);
  // A trailing source comment must not swallow the projection's closing group.
  const lastLine = source.slice(Math.max(source.lastIndexOf('\r'), source.lastIndexOf('\n')) + 1);
  insert(source.length, `${lastLine.includes('%') ? '\n' : ''}\\endgroup`);
  let projection = '';
  const forward = [], backward = [0], insertions = [];
  for (let i = 0; i <= source.length; i++) {
    const text = events.get(i);
    if (text) {
      const from16 = projection.length;
      projection += text;
      for (let j = from16; j <= projection.length; j++) backward[j] = i;
      insertions.push({source16: i, from16, to16: projection.length, text});
    }
    forward[i] = projection.length;
    if (i < source.length) {
      projection += source[i];
      backward[projection.length] = i + 1;
    }
  }
  return {projection, forward, backward, insertions};
}

/**
 * Returns a deeply frozen snapshot. Unsupported input keeps source/projection
 * identical, has no editable slots/atoms/mapping, and includes diagnostics.
 * Mapping arrays use null for offsets splitting a surrogate/UTF-8 sequence.
 * Inserted projection boundaries map to their source anchor. Source boundaries
 * map AFTER insertions at that boundary (right affinity).
 */
export function projectMath(source, {previous, attribute = 65000, firstTag = 1} = {}) {
  if (typeof source !== 'string') throw new TypeError('Math source must be a string');
  if (!Number.isInteger(attribute) || attribute < 0 || attribute > 65535) {
    throw new RangeError('Attribute must be an integer between 0 and 65535');
  }
  if(!Number.isSafeInteger(firstTag)||firstTag<1||firstTag+source.length>=2147483647)
    throw new RangeError('Invalid initial math owner ID');
  const prior = previous === undefined ? undefined : snapshots.get(previous);
  if (previous !== undefined && !prior) throw new TypeError('Previous must be a projectMath snapshot');
  let sourceUnits, tree;
  try {
    sourceUnits = unicode(source);
    tree = parse(source);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const result = freeze({
      supported: false, source, projection: source, slots: [], atoms: [], attribute,
      diagnostics: [{code: 'unsupported-math', message: error.message, from16: error.offset ?? 0}],
    });
    snapshots.set(result, {source, nextId: prior?.nextId ?? 1});
    return result;
  }
  const nextId = reconcile(tree.root, source, prior, firstTag);
  const {projection, forward, backward, insertions} = instrument(source, tree.root, attribute);
  const projectionUnits = unicode(projection);
  const atoms = [], slots = [];
  function slot(owner, role, from16, to16, grouped, single = false) {
    slots.push({
      id: `${owner.id}:${role}`, ownerId: owner.id, tag: owner.tag, role,
      from16, to16, from8: sourceUnits.to8[from16], to8: sourceUnits.to8[to16],
      raw: source.slice(from16, to16), grouped, single,
    });
  }
  function visit(node) {
    atoms.push({
      id: node.id, tag: node.tag, kind: node.kind, path: node.path,
      from16: node.from16, to16: node.to16,
      from8: sourceUnits.to8[node.from16], to8: sourceUnits.to8[node.to16],
      raw: source.slice(node.from16, node.to16),
      ...(node.command?{command:node.command}:{}),
      ...(node.kind==='token'?{nucleus:source.slice(node.from16,node.nucleusTo16)}:{}),
      slotIds: [
        ...(node.kind === 'token' ? [`${node.id}:nucleus`] : []),
        ...node.fields.map(f => `${node.id}:${f.role}`),
      ],
    });
    if (node.kind === 'token') slot(node, 'nucleus', node.from16, node.nucleusTo16, false);
    for (const field of node.fields) {
      slot(node, field.role, field.from16, field.to16, field.grouped, !!field.single);
      field.children.forEach(visit);
    }
  }
  visit(tree.root);
  // UTF-16 code-unit iteration above preserves source, but interior surrogate
  // boundaries are not legal cursor/index map entries.
  for (let i = 0; i < forward.length; i++) if (sourceUnits.to8[i] === null) forward[i] = null;
  for (let i = 0; i < backward.length; i++) if (projectionUnits.to8[i] === null) backward[i] = null;
  const result = freeze({
    supported: true, source, projection, slots, atoms, attribute, diagnostics: [],nextTag:nextId,
    mapping: {
      source16To8: sourceUnits.to8, source8To16: sourceUnits.to16,
      projection16To8: projectionUnits.to8, projection8To16: projectionUnits.to16,
      sourceToProjection16: forward, projectionToSource16: backward,
      sourceToProjection8: sourceUnits.to16.map(i => i === null ? null : projectionUnits.to8[forward[i]]),
      projectionToSource8: projectionUnits.to16.map(i => i === null ? null : sourceUnits.to8[backward[i]]),
      insertions,
    },
  });
  snapshots.set(result, {source, tree, nextId});
  return result;
}

/**
 * Plain-content edit only: does not delete/insert structural TeX or comments.
 * Throws for unknown slots, invalid Unicode/grapheme boundaries, or edits that
 * would change an ungrouped script's extent. Returned patch uses document UTF-16
 * offsets; selection includes both document and updated slot-local offsets.
 * It is a single minimal patch, trimmed only at grapheme boundaries.
 */
const structureTemplates = {
  frac: text => ({before:'\\frac{', body:text, after:'}{}', next:text ? 'denominator' : 'first'}),
  sqrt: text => ({before:'\\sqrt{', body:text, after:'}', next:'first'}),
  indexedRoot: text => ({before:'\\sqrt[', body:'', after:']{'+text+'}', next:'first'}),
  superscript: text => ({before:text+'^{',body:'',after:'}',next:'first'}),
  subscript: text => ({before:text+'_{',body:'',after:'}',next:'first'}),
  ...Object.fromEntries([...mathWrappers].filter(command=>command!=='\\mathord').map(command=>[
    command.slice(1),text=>({before:command+'{',body:text,after:'}',next:'first'}),
  ])),
  ...Object.fromEntries(largeOperators.map(operator=>[
    operator,
    text=>({before:'\\'+operator+'{',body:text,after:'}',next:'operator'}),
  ])),
  ...Object.fromEntries(['matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix'].map(environment=>[
    environment,
    text=>({before:'\\begin{'+environment+'}',body:text,after:'&\\\\&\\end{'+environment+'}',next:'first'}),
  ])),
  cases: text => ({before:'\\begin{cases}',body:text,after:'&\\\\&\\end{cases}',next:'first'}),
};

export const nativeMathCommandNames=Object.freeze([...new Set([
  ...Object.keys(structureTemplates),...[...symbols].filter(command=>/^\\[A-Za-z]+$/.test(command)).map(command=>command.slice(1)),
])]);

export function expandMatrix(snapshot,slot,local,axis,{enterRow=false}={}) {
  if(!snapshots.get(snapshot)?.tree||!snapshot.slots.includes(slot)||
      !Number.isInteger(local)||local<0||local>slot.raw.length||!['row','column'].includes(axis))return null;
  const cursor=slot.from16+local;
  const matrices=snapshot.atoms.filter(atom=>atom.kind==='matrix'&&atom.from16<cursor&&atom.to16>cursor&&
    (!enterRow||/^(?:align(?:ed)?(?:at)?|flalign|gather(?:ed)?|multline|eqnarray|split)\*?$/.test(atom.command)))
    .sort((left,right)=>(left.to16-left.from16)-(right.to16-right.from16));
  const byId=new Map(snapshot.slots.map(candidate=>[candidate.id,candidate]));
  for(const atom of matrices){
    const rows=[];
    let origin;
    for(const id of atom.slotIds){
      const cell=byId.get(id),coordinates=/^cell\.(\d+)\.(\d+)$/.exec(cell?.role??'');
      if(!coordinates)continue;
      const row=Number(coordinates[1]),column=Number(coordinates[2]);
      (rows[row]??=[]).push(cell);
      if(slot.from16>=cell.from16&&slot.to16<=cell.to16)origin={row,column};
    }
    if(!origin)continue;
    if(axis==='column'&&(/^(?:align(?:ed)?at|gather(?:ed)?|multline|eqnarray|split)\*?$|cases$/.test(atom.command)||
        rows.some(row=>row.length<=origin.column)))return null;
    const width=rows.reduce((maximum,row)=>Math.max(maximum,row.length),0);
    const edits=axis==='row'
      ?[{from:rows[origin.row].at(-1).to16,insert:'\\\\'+'&'.repeat(width-1)}]
      :rows.map(row=>({from:row[origin.column].to16,insert:'&'}));
    const from=edits[0].from,to=edits.at(-1).from;
    const insert=edits.reduceRight((body,edit)=>
      body.slice(0,edit.from-from)+edit.insert+body.slice(edit.from-from),snapshot.source.slice(from,to));
    const source=snapshot.source.slice(0,from)+insert+snapshot.source.slice(to);
    parse(source);
    const next=enterRow ? from+2+origin.column :
      cursor+edits.filter(edit=>edit.from<cursor).reduce((count,edit)=>count+edit.insert.length,0);
    return {source,patch:{from,to,insert},cursor:next};
  }
  return null;
}

export function insertDisplayLine(snapshot,slot,local) {
  if(!snapshots.get(snapshot)?.tree||!snapshot.slots.includes(slot)||!Number.isInteger(local)||
    local<0||local>slot.raw.length)return null;
  const row=expandMatrix(snapshot,slot,local,'row',{enterRow:true});
  if(row)return row;
  const caret=slot.from16+local;
  const {source}=snapshot;
  const root=snapshots.get(snapshot).tree.root;
  const isBoundary=caret===0||caret===source.length||root.fields[0].children.some(atom=>
    caret===atom.from16||caret===atom.to16);
  const split=isBoundary?caret:source.length;
  const open='\\begin{gathered}',close='\\end{gathered}';
  const insert=open+source.slice(0,split)+'\\\\'+source.slice(split)+close;
  parse(insert);
  return {source:insert,patch:{from:0,to:source.length,insert},cursor:open.length+split+2,requiresAmsmath:true};
}

export function toggleFormulaDisplayStyle(snapshot,cursor) {
  if(!snapshots.get(snapshot)?.tree||!Number.isInteger(cursor)||cursor<0||cursor>snapshot.source.length)return null;
  const {source}=snapshot;
  const from=source.search(/\S/);
  if(from<0)return null;
  const existing=mathStyle.exec(source.slice(from));
  const inserted=existing?.[1]==='display'?'':'\\displaystyle ';
  let to=from+(existing?.[0].length??0);
  if(existing&&/[ \t]/.test(source[to]??''))to++;
  const patch={from,to,insert:inserted};
  const revised=source.slice(0,from)+inserted+source.slice(to);
  if(!revised.trim()||!projectMath(revised).supported)return null;
  return {source:revised,patch,cursor:Math.max(from+inserted.length,cursor+inserted.length-(to-from))};
}

export function applyStructureCommand(snapshot, {slotId,from16,to16,command}) {
  const slot=snapshot.slots.find(candidate=>candidate.id===slotId);
  if(!slot)return null;
  if(!Object.hasOwn(structureTemplates,command)){
    const tex='\\'+command;
    if(!symbols.has(tex))return null;
    const after=snapshot.source[slot.from16+to16];
    const insert=tex+(after&&/[A-Za-z]/.test(after)?' ':'');
    const result=editSlot(snapshot,{slotId,from16,to16,insert},true);
    return {source:result.source,patch:result.patch,cursor:slot.from16+from16+tex.length};
  }
  const selected=slot.raw.slice(from16,to16);
  if(!editable.test(selected))return null;
  const template=structureTemplates[command](selected);
  const insert=template.before+template.body+template.after;
  const result=editSlot(snapshot,{slotId,from16,to16,insert},true);
  const cursor=slot.from16+from16+template.before.length+
    (template.next==='denominator'?template.body.length+2:template.next==='operator'?-1:0);
  return {source:result.source,patch:result.patch,cursor};
}

// Geometry asks for both edges of every glyph. Index the immutable source once
// so looking up a caret never constructs, segments, or parses a hypothetical edit.
export function caretSlot(snapshot, tag, role, after) {
  const state=snapshots.get(snapshot);
  if(!state?.tree)return null;
  if(!state.caretIndex){
    const allowed=new Uint8Array(snapshot.source.length+1);
    for(const part of segmenter.segment(snapshot.source))allowed[part.index]=1;
    allowed[snapshot.source.length]=1;
    for(const {from16,to16,kind} of state.tree.protectedRanges){
      allowed.fill(0,from16+1,to16+(kind==='comment'?1:0));
    }
    const slots=new Map();
    for(const slot of snapshot.slots){
      const key=slot.tag+':'+slot.role;
      slots.set(key,slots.has(key)?null:slot);
    }
    state.caretIndex={allowed,slots};
  }
  const {allowed,slots}=state.caretIndex;
  const slot=slots.get(tag+':'+role);
  return slot&&allowed[after?slot.to16:slot.from16]?slot:null;
}

export function applySlotEdit(snapshot, edit) {
  return editSlot(snapshot,edit,false);
}

export function applyPastedMath(snapshot,edit){
  const slot=snapshot.slots.find(candidate=>candidate.id===edit.slotId);
  if(!slot||typeof edit.insert!=='string'||edit.insert.includes('%')||!parse(edit.insert).root.fields[0].children.length)
    return null;
  const following=snapshot.source[slot.from16+edit.to16]??'';
  const terminator=/\\[A-Za-z]+$/.test(edit.insert)&&/[A-Za-z]/.test(following)?' ':'';
  return editSlot(snapshot,{...edit,insert:edit.insert+terminator},true);
}

export function nativeOperatorBody(snapshot,atom) {
  if(!largeOperators.includes(atom?.nucleus?.slice(1))||!atom.nucleus.startsWith('\\'))return null;
  const boundary=atom.path.lastIndexOf('/');
  const nextPath=atom.path.slice(0,boundary+1)+(Number(atom.path.slice(boundary+1))+1);
  const body=snapshot.atoms.find(candidate=>candidate.kind==='group'&&candidate.path===nextPath);
  if(!body||snapshot.source.slice(atom.to16,body.from16).trim())return null;
  const slot=snapshot.slots.find(candidate=>candidate.ownerId===body.id&&candidate.role==='body');
  return slot?{atom:body,slot}:null;
}

export function applyScalableFence(snapshot,slot,from16,to16,pair) {
  const delimiters=Array.isArray(pair)&&parseDelimiterPair(pair.join(' '));
  if(!delimiters||!snapshots.get(snapshot)?.tree||!snapshot.slots.includes(slot))return null;
  const [left,right]=delimiters;
  const selected=slot.raw.slice(from16,to16);
  // The gap terminates named delimiters when the selected text starts with a letter.
  const prefix='\\left'+left+(/\\[A-Za-z]+$/.test(left)&&/^[A-Za-z]/.test(selected)?' ':'');
  const after=snapshot.source[slot.from16+to16];
  const suffix='\\right'+right+(/\\[A-Za-z]+$/.test(right)&&after&&/[A-Za-z]/.test(after)?' ':'');
  const edit=editSlot(snapshot,{slotId:slot.id,from16,to16,insert:prefix+selected+suffix,
    preserved: selected},true);
  return {source:edit.source,patch:edit.patch,cursor:slot.from16+from16+prefix.length};
}

export function removeEmptyScript(snapshot,slot) {
  if(!snapshots.get(snapshot)?.tree||!snapshot.slots.includes(slot)||slot.raw||
    !['superscript','subscript'].includes(slot.role)||!slot.grouped)return null;
  const from=slot.from16-2,to=slot.to16+1;
  const expected=slot.role==='superscript'?'^{}':'_{}';
  if(snapshot.source.slice(from,to)!==expected)return null;
  const source=snapshot.source.slice(0,from)+snapshot.source.slice(to);
  parse(source);
  return {source,patch:{from,to,insert:''},cursor:from};
}

export function applySingleCharacterScript(snapshot,slot,local,marker,text) {
  if(!snapshots.get(snapshot)?.tree||!snapshot.slots.includes(slot)||!['^','_'].includes(marker)||
    [...segmenter.segment(text)].length!==1)return null;
  const at=slot.from16+local;
  if(marker==='^'&&text==='^'){
    const literal='\\text{ˆ}';
    const edit=editSlot(snapshot,{slotId:slot.id,from16:local,to16:local,insert:literal},true);
    return {source:edit.source,patch:edit.patch,cursor:at+literal.length};
  }
  if(!editable.test(text)||!text.trim())return null;
  const role=marker==='^'?'superscript':'subscript';
  const owner=snapshot.atoms.find(atom=>atom.id===slot.ownerId);
  const existing=snapshot.slots.find(field=>field.ownerId===owner?.id&&field.role===role);
  if(existing){
    if(existing.raw.trim())return null;
    const edit=editSlot(snapshot,{slotId:existing.id,from16:0,to16:existing.raw.length,insert:text},true);
    return {source:edit.source,patch:edit.patch,cursor:owner.to16+text.length-existing.raw.length};
  }
  const insert=marker+'{'+text+'}';
  const edit=editSlot(snapshot,{slotId:slot.id,from16:local,to16:local,insert},true);
  return {source:edit.source,patch:edit.patch,cursor:at+insert.length};
}

function editSlot(snapshot, {slotId, from16, to16, insert,preserved}, structure) {
  const state = snapshots.get(snapshot);
  if (!state?.tree || !snapshot.supported) throw new TypeError('Expected a supported projectMath snapshot');
  const slot = snapshot.slots.find(candidate => candidate.id === slotId);
  if (!slot) throw new RangeError('Unknown or stale math slot');
  if (!Number.isInteger(from16) || !Number.isInteger(to16) ||
      from16 < 0 || to16 < from16 || to16 > slot.raw.length) {
    throw new RangeError('Invalid slot-local UTF-16 range');
  }
  if (typeof insert !== 'string') throw new TypeError('Inserted content must be a string');
  unicode(insert);
  const boundaries = new Set([0, snapshot.source.length]);
  for (const part of segmenter.segment(snapshot.source)) boundaries.add(part.index);
  let from = slot.from16 + from16, to = slot.from16 + to16;
  if (!boundaries.has(from) || !boundaries.has(to)) throw new RangeError('Edit splits a grapheme');
  if (!structure && !editable.test(insert)) throw new SyntaxError('Structural or unsupported math insertion');
  if(!structure&&/^[A-Za-z]/.test(insert)){
    const control=state.tree.protectedRanges.find(range=>range.kind==='command'&&range.to16===from);
    if(control&&symbols.has(snapshot.source.slice(control.from16,from)))insert=' '+insert;
  }
  const symbol=!structure&&!insert&&slot.role==='nucleus'&&from===slot.from16&&to===slot.to16&&symbols.has(slot.raw)
    ?snapshot.atoms.find(atom=>atom.id===slot.ownerId):null;
  const removeSymbol=symbol&&snapshot.slots.every(candidate=>candidate.ownerId!==symbol.id||
    candidate.role==='nucleus'||!candidate.raw.trim());
  if(removeSymbol){
    to=symbol.to16;
    if(largeOperators.includes(slot.raw.slice(1))&&snapshot.source.startsWith('{}',to))to+=2;
  }
  for (const range of state.tree.protectedRanges) {
    if(removeSymbol&&range.from16>=from&&range.to16<=to)continue;
    if(structure&&preserved&&!['comment','annotation'].includes(range.kind)&&range.from16>=from&&range.to16<=to)continue;
    if ((from < range.to16 && to > range.from16) ||
        (from === to && from > range.from16 && from < range.to16) ||
        (range.kind === 'comment' && from === range.to16)) {
      throw new SyntaxError('Edit touches structural TeX or a comment');
    }
  }
  const source = snapshot.source.slice(0, from) + insert + snapshot.source.slice(to);
  const cursor = from + insert.length;
  const newBoundaries = new Set([0, source.length]);
  for (const part of segmenter.segment(source)) newBoundaries.add(part.index);
  if (!newBoundaries.has(cursor)) throw new RangeError('Selection would split a grapheme');
  for (const arg of state.tree.singleArguments) {
    if(removeSymbol&&arg.from16>=from&&arg.to16<=to)continue;
    if(structure&&preserved&&arg.from16>from&&arg.to16<to)continue;
    if (from <= arg.to16 && to >= arg.from16) {
      // Check the original single-argument field, even when editing via an
      // ancestor slot. Inserting "ab" into x^a must not silently escape ^.
      const start = Math.max(from, arg.from16), end = Math.min(to, arg.to16);
      const raw = snapshot.source.slice(arg.from16, start) + insert + snapshot.source.slice(end, arg.to16);
      if (!ordinary.test(raw) || [...segmenter.segment(raw)].length !== 1) {
        throw new SyntaxError('Edit changes the extent of an ungrouped script');
      }
    }
  }
  parse(source);
  const before = snapshot.source.slice(from, to);
  const leftParts = [...segmenter.segment(before)].map(s => s.segment);
  const rightParts = [...segmenter.segment(insert)].map(s => s.segment);
  let left = 0, oldRight = leftParts.length, newRight = rightParts.length;
  while (left < oldRight && left < newRight && leftParts[left] === rightParts[left]) left++;
  while (oldRight > left && newRight > left && leftParts[oldRight - 1] === rightParts[newRight - 1]) {
    oldRight--;
    newRight--;
  }
  from += leftParts.slice(0, left).join('').length;
  to -= leftParts.slice(oldRight).join('').length;
  const patch = {from, to, insert: rightParts.slice(left, newRight).join('')};
  return freeze({
    source, patch,
    selection: {slotId, from16: cursor - slot.from16, to16: cursor - slot.from16, anchor16: cursor, head16: cursor},
  });
}
