const workspacePreference='lineae.native-document-workspace';
let desktopEngine;

export const desktopEngineToggle=()=>window.__LINEAE_DESKTOP_ENGINE_TOGGLE__===true;

export function selectDesktopEngine(lua,{remember=true}={}){
  desktopEngine=lua;
  if(remember)try {window.localStorage.setItem(workspacePreference,lua?'1':'0');} catch {}
}

export function nativeWorkspacePreference() {
  if(!window.__TAURI__?.core?.invoke)return null;
  try{return window.localStorage.getItem(workspacePreference)==='1';}
  catch{return null;}
}

export function nativeWorkspaceRequested() {
  if(!window.__TAURI__?.core?.invoke)return false;
  const requested=new URLSearchParams(location.search).get('native-workspace');
  if(desktopEngineToggle())return desktopEngine??(requested===null?nativeWorkspacePreference()||!hasEnginePreference():requested==='1');
  return requested===null?nativeWorkspacePreference()===true:requested==='1';
}

function hasEnginePreference(){
  try{return window.localStorage.getItem(workspacePreference)!==null;}catch{return false;}
}

export function nativeOnlyAcceptance() {
  return Boolean(window.__TAURI__?.core?.invoke) &&
    ((!desktopEngineToggle()&&nativeWorkspaceRequested())||new URLSearchParams(location.search).get('native-only-acceptance')==='1');
}

export async function loadLegacyMath(){
  if(nativeOnlyAcceptance())return;
  await new Promise(resolve=>{
    const script=document.createElement('script');
    script.src=new URL('vendor/mathlive/mathlive.min.js',document.baseURI).href;
    script.addEventListener('load',resolve,{once:true});
    script.addEventListener('error',resolve,{once:true});
    document.head.append(script);
  });
}
