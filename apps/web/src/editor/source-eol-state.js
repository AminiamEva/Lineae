import { StateEffect, StateField } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import { sourceEndings, updateEndings, serializeSource } from './source-eol.mjs';

const restoreEndings = StateEffect.define();

const endingsField = StateField.define({
  create: () => [],
  update(endings, transaction) {
    // History replays these in reverse edit order. The oldest snapshot wins
    // when several edits were grouped into one undo event.
    let restored;
    for (const effect of transaction.effects) {
      if (effect.is(restoreEndings)) restored = effect.value;
    }
    if (restored) return restored;
    const changes = [];
    transaction.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => {
      changes.push({
        from: transaction.startState.doc.lineAt(from).number - 1,
        to: transaction.startState.doc.lineAt(to).number - 1,
        inserted: inserted.lines - 1,
      });
    });
    return updateEndings(endings, changes);
  },
});

export function sourceEolExtensions(source) {
  return [
    endingsField.init(() => sourceEndings(source)),
    invertedEffects.of(transaction => transaction.docChanged
      ? [restoreEndings.of(transaction.startState.field(endingsField))]
      : []),
  ];
}

export function sourceWithEndings(state) {
  return serializeSource(state.doc.toString(), state.field(endingsField));
}
