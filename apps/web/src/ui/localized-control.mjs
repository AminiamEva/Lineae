import {t,localizeText} from './i18n.mjs';

export function localizedLabel(node,zh,en){
  Object.assign(node.dataset,{zh,en});
  node.textContent=t(zh,en);
  return node;
}
export function localizedTitle(node,zh,en){
  Object.assign(node.dataset,{zhTitle:zh,enTitle:en});
  node.setAttribute('aria-label',t(zh,en));
  return node;
}
export function localizedPlaceholder(node,zh,en){
  Object.assign(node.dataset,{zhPlaceholder:zh,enPlaceholder:en,placeholder:t(zh,en)});
}
export function findResultText(result,language){
  if(result==='none')return localizeText('无匹配','No matches',language);
  if(result==='all')return localizeText('已全部替换','All replaced',language);
  return null;
}
