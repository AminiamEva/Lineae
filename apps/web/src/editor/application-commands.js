import {snippetCompletion} from '@codemirror/autocomplete';
import {t} from '../ui/i18n.mjs';

const EVENTS = Object.freeze({settings:'lineae-open-settings',outline:'lineae-open-outline',projectincludes:'lineae-open-includes'});
export function applicationCommandActions() {
  return Object.fromEntries(Object.entries(EVENTS).map(([name,event]) => [name,() => document.dispatchEvent(new Event(event))]));
}
export function applicationCompletionOptions() {
  const actions = Object.entries(EVENTS).map(([name,event]) => ({
    label:'\\' + name,type:'keyword',
    apply(view,completion,from,to) {
      view.dispatch({changes:{from,to,insert:''}});
      document.dispatchEvent(new Event(event));
    },
  }));
  const files = ['input','include'].map(name => snippetCompletion('\\' + name + '{1}',{
    label:'\\' + name,type:'keyword',detail:t('引用 TeX 子文件','Include a TeX file'),
  }));
  return [...actions,...files];
}
