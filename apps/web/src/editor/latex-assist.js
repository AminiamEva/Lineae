import { Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, Decoration } from '@codemirror/view';
import { autocompletion, completionKeymap, acceptCompletion, snippetCompletion, snippet,
  nextSnippetField, prevSnippetField, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { indentMore, indentLess, isolateHistory, invertedEffects } from '@codemirror/commands';
import { foldService, foldGutter, foldKeymap, indentService, indentUnit } from '@codemirror/language';
import { commandSnippets, environmentSnippet, environments } from './latex-snippets.js';

export function commentAt(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === '%') return i;
  }
  return -1;
}

export function scanLatex(text) {
  const stack = [], folds = [], errors = [], literals = [];
  const pattern = /%[^\n]*|\\(?:begin|end)\{([^{}\n]+)\}|\\[^a-zA-Z]|[{}]/g;
  let literal;
  for (const match of text.matchAll(pattern)) {
    const value = match[0], from = match.index, to = from + value.length;
    if (literal) {
      if (value === '\\end{' + literal.name + '}') {
        literals.push({from:literal.from,to});
        folds.push({from:literal.to,to:from}); literal = null;
      }
      continue;
    }
    if (value[0] === '%') continue;
    if (/^\\begin\{(?:verbatim\*?|lstlisting|minted)\}/.test(value)) {
      literal = {name:match[1],from,to}; continue;
    }
    if (value.startsWith('\\begin') || value === '{') stack.push({name:match[1] || '{',from,to});
    else if (value.startsWith('\\end') || value === '}') {
      const expected = match[1] || '{', open = stack.at(-1);
      if (open?.name === expected) { stack.pop(); if (expected !== '{') folds.push({from:open.to,to:from}); }
      else errors.push({from,to,message:'Unmatched ' + value});
    }
  }
  if (literal) { literals.push({from:literal.from,to:text.length+1}); stack.push(literal); }
  for (const open of stack) errors.push({from:open.from,to:open.to,message:'Unclosed ' + open.name});
  return {folds,errors,literals};
}

const structure = StateField.define({
  create: state => scanLatex(state.doc.toString()),
  update: (value, tr) => tr.docChanged ? scanLatex(tr.newDoc.toString()) : value,
  provide: field => EditorView.decorations.from(field, value => Decoration.set(
    value.errors.map(error => Decoration.mark({class:'tex-structure-error',attributes:{title:error.message}}).range(error.from,error.to)), true)),
});

function excluded(state, pos) {
  const line = state.doc.lineAt(pos), comment = commentAt(line.text);
  return (comment >= 0 && pos >= line.from + comment) ||
    state.field(structure).literals.some(range => pos > range.from && pos < range.to);
}

export function latexCompletion(context) {
  if (excluded(context.state, context.pos)) return null;
  const env = context.matchBefore(/\\begin\{[\w*]*\}?/);
  if (env) {
    const typed = env.text.slice(7).replace(/\}$/, '');
    return {from:env.from,to:context.pos,filter:false,options:environments
    .filter(name => name.startsWith(typed))
    .map(name => ({label:name,type:'type',detail:'Paired environment',apply(view, _option, from, to) {
      if (view.state.doc.sliceString(to, to + 1) === '}') to++;
      const begin = '\\begin{' + name + '}';
      const rest = view.state.doc.sliceString(to);
      const end = /^(\s*)\\end\{([^{}]+)\}/.exec(rest);
      if (end && typed && (end[2] === name || end[2].startsWith(typed))) {
        // The document may already contain a closer for the abbreviated name.
        // Rename it instead of inserting a second, unmatched environment.
        const endStart = to + end.index + end[1].length;
        const endEnd = endStart + end[0].length - end[1].length;
        const unit = view.state.facet(indentUnit);
        let body = view.state.doc.sliceString(to, endStart);
        let lead;
        const firstLine = /^(\r?\n)([ \t]*)/.exec(body);
        if (firstLine) {
          const indent = firstLine[2] || unit;
          const rest = body.slice(firstLine[0].length);
          body = firstLine[1] + indent + (rest.trim() ? rest : firstLine[1]);
          lead = firstLine[1].length + indent.length;
        } else {
          const eol = '\n';
          body = eol + unit + (body.trim() ? body : eol);
          lead = eol.length + unit.length;
        }
        view.dispatch({
          changes: {from,to:endEnd,insert:begin + body + '\\end{' + name + '}'},
          selection: {anchor:from + begin.length + lead},
          userEvent: 'input.complete',
        });
        return;
      }
      snippet(environmentSnippet(name))(view, null, from, to);
    }}))};
  }
  const word = context.matchBefore(/\\[a-zA-Z]*/);
  if (word) return {from:word.from, options:Object.entries(commandSnippets).map(([name,[template,detail]]) =>
    snippetCompletion(template,{label:'\\' + name,type:'keyword',detail})), validFor:/^\\[a-zA-Z]*$/};
  const reference = context.matchBefore(/\\(?:ref|eqref|cite)\{[^{}]*$/);
  if (reference) {
    const source = context.state.doc.toString();
    const cite = reference.text.startsWith('\\cite');
    const re = cite ? /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g : /\\label\{([^}]+)\}/g;
    return {from:reference.from + reference.text.indexOf('{') + 1,
      options:[...new Set([...source.matchAll(re)].map(m => m[1]))].map(label => ({label,type:'variable'}))};
  }
  return null;
}

const setPairs = StateEffect.define();
const pairs = StateField.define({
  create: () => [],
  update(value, tr) {
    let mapped = value.map(pair => ({...pair,from:tr.changes.mapPos(pair.from,1)}))
      .filter(pair => tr.newDoc.sliceString(pair.from,pair.from + pair.close.length) === pair.close);
    for (const effect of tr.effects) if (effect.is(setPairs)) mapped = effect.value;
    return mapped;
  },
});

function pairInput(view, from, to, text) {
  if (view.composing || view.state.selection.ranges.length > 1) return false;
  const {state} = view;
  if (excluded(state,from)) {
    // Consume normal input so the general bracket extension cannot pair here.
    view.dispatch(state.update({changes:{from,to,insert:text},selection:{anchor:from+text.length},userEvent:'input.type'}));
    return true;
  }
  const pair = state.field(pairs).find(p => p.from === from);
  if (pair && from === to && text === '$' && pair.open === '$' && pair.close === '$' && state.doc.sliceString(from-1,from) === '$') {
    view.dispatch({changes:{from,to,insert:'$$'},selection:{anchor:from+1},effects:setPairs.of([{from:from+1,close:'$$',open:'$$'}]),userEvent:'input.type'});
    return true;
  }
  if (pair && from === to && pair.close.startsWith(text)) {
    view.dispatch({selection:{anchor:from+text.length},effects:setPairs.of(state.field(pairs).filter(p=>p!==pair).concat(
      pair.close.length > text.length ? [{...pair,from:from+text.length,close:pair.close.slice(text.length),open:''}] : []))});
    return true;
  }
  const previous = state.doc.sliceString(Math.max(0,from-1),from);
  let open, close;
  if (text === '$' && previous !== '\\') {open='$';close='$';}
  if (previous === '\\' && (text === '(' || text === '[')) {open='\\'+text;close=text === '(' ? '\\)' : '\\]';}
  if (!close) return false;
  const selected = state.doc.sliceString(from,to);
  view.dispatch({changes:{from,to,insert:text+selected+close},selection:{anchor:from+text.length,head:from+text.length+selected.length},
    effects:setPairs.of(state.field(pairs).concat({from:from+text.length+selected.length,open,close})),userEvent:'input.type'});
  return true;
}

function deletePair(view) {
  const {from,to} = view.state.selection.main;
  if (from !== to) return false;
  const pair = view.state.field(pairs).find(p=>p.from === from && p.open && view.state.doc.sliceString(from-p.open.length,from) === p.open);
  if (!pair) return false;
  view.dispatch({changes:{from:from-pair.open.length,to:from+pair.close.length},selection:{anchor:from-pair.open.length},userEvent:'delete.backward'});
  return true;
}

function environmentEnter(view) {
  const {from,to} = view.state.selection.main;
  if (from !== to || excluded(view.state,from)) return false;
  const line = view.state.doc.lineAt(from);
  const match = line.text.slice(0,from-line.from).match(/^(\s*)\\begin\{([\w*]+)\}(?:\[[^\]]*\])?\s*$/);
  if (!match || from !== line.to || view.state.field(structure).folds.some(f=>f.from <= from && f.from >= line.from)) return false;
  // An abbreviated name such as "enum" should be finished by the completion
  // popup instead of receiving a closer for the prefix itself.
  if (environments.some(name => name !== match[2] && name.startsWith(match[2]))) return false;
  const padding = match[1], unit = view.state.facet(indentUnit);
  view.dispatch({changes:{from,insert:'\n'+padding+unit+'\n'+padding+'\\end{'+match[2]+'}'},selection:{anchor:from+1+padding.length+unit.length},userEvent:'input.type',annotations:isolateHistory.of('full')});
  return true;
}

export function insertLatexSnippet(view, {text, selectionStart, selectionEnd}) {
  const {from,to} = view.state.selection.main;
  if (selectionStart === undefined) {
    // Parse only the fixed template. Keep selected source in place so its
    // literal syntax and per-separator EOL metadata never need reconstruction.
    if (from !== to && text.includes('${1}')) {
      snippet(text)({state:view.state, dispatch(tr) {
        const field = tr.newSelection.main;
        const end = tr.newDoc.length - (view.state.doc.length - to);
        const prefix = tr.newDoc.sliceString(from,field.from);
        const suffix = tr.newDoc.sliceString(field.to,end);
        const fill = tr.state.changes({from:field.from,to:field.to,insert:view.state.doc.slice(from,to)});
        view.dispatch({changes:[{from,insert:prefix},{from:to,insert:suffix}],
          selection:{anchor:from+prefix.length,head:to+prefix.length},
          effects:StateEffect.mapEffects(tr.effects,fill),
          annotations:isolateHistory.of('full'),userEvent:'input'});
      }},null,from,to);
      view.focus();
      return;
    }
    view.dispatch({annotations:isolateHistory.of('before')});
    snippet(text)(view,null,from,to);
    view.dispatch({annotations:isolateHistory.of('after')});
  } else view.dispatch({changes:{from,to,insert:text},selection:{anchor:from+selectionStart,head:from+(selectionEnd??selectionStart)},annotations:isolateHistory.of('full'),userEvent:'input'});
  view.focus();
}

export function latexAssist() {
  return [structure, pairs, invertedEffects.of(tr=>tr.docChanged?[setPairs.of(tr.startState.field(pairs))]:[]), indentUnit.of('    '),
    autocompletion({override:[latexCompletion],activateOnTyping:true}),
    EditorStateLanguageData(), closeBrackets(),
    Prec.highest(EditorView.inputHandler.of(pairInput)),
    Prec.high(keymap.of([
      {key:'Tab',run:view=>acceptCompletion(view)||nextSnippetField(view)||indentMore(view)},
      {key:'Shift-Tab',run:view=>prevSnippetField(view)||indentLess(view)},
      {key:'Backspace',run:deletePair}, {key:'Enter',run:environmentEnter},
      ...completionKeymap,...closeBracketsKeymap,...foldKeymap,
    ])),
    foldGutter(), foldService.of((state,from,to)=>state.field(structure).folds.find(f=>f.from>=from && f.from<=to && state.doc.lineAt(f.to).number>state.doc.lineAt(from).number)),
    indentService.of((context,pos)=>{
      const line=context.state.doc.lineAt(pos), before=context.state.doc.sliceString(0,line.from);
      if (excluded(context.state,pos)) return null;
      let depth=0;
      for (const raw of before.split('\n')) {
        const at=commentAt(raw), text=at<0?raw:raw.slice(0,at);
        depth += [...text.matchAll(/\\begin\{(?!document\})[^}]+\}/g)].length - [...text.matchAll(/\\end\{(?!document\})[^}]+\}/g)].length;
      }
      if (/^\s*\\end\{(?!document\})/.test(line.text)) depth--;
      return Math.max(0,depth)*context.unit;
    }),
  ];
}

// Keep language data independent of the legacy stream parser's token state.
import { EditorState } from '@codemirror/state';
function EditorStateLanguageData() {
  return EditorState.languageData.of(() => [{closeBrackets:{brackets:['(','[','{']},commentTokens:{line:'%'}}]);
}
