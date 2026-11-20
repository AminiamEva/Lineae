import {parseYaml} from '../editor/config.mjs';

export function settingsProposal(current, controls) {
  const proposal = structuredClone(current);
  for (const control of controls) {
    const {input,path,value} = control;
    let next;
    if (typeof value === 'boolean') next = input.checked;
    else if (typeof value === 'number') next = Number(input.value);
    else if (Array.isArray(value) || value === null) next = parseYaml('value: ' + input.value).value;
    else next = input.value;
    let owner = proposal;
    for (const key of path.slice(0,-1)) owner = owner[key];
    owner[path.at(-1)] = next;
  }
  return proposal;
}
export function layoutProposal(original, controls) {
  if (!original || !controls) return null;
  const patch = {paper:controls.paper.value,orientation:controls.orientation.value,margins:{}};
  for (const side of ['top','right','bottom','left']) {
    const value = controls[side].value.trim();
    if (!/^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(value)) throw new Error('Invalid margin: ' + value);
    patch.margins[side] = value;
  }
  const same = patch.paper === original.paper && patch.orientation === original.orientation &&
    Object.entries(patch.margins).every(([side,value]) => value === original.margins[side]);
  return same ? null : patch;
}
