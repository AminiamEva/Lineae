const workspacePreference='lineae.native-document-workspace';

export function nativeWorkspacePreference() {
  if(!window.__TAURI__?.core?.invoke)return null;
  try{return window.localStorage.getItem(workspacePreference)==='1';}
  catch{return null;}
}

export function saveNativeWorkspacePreference(enabled) {
  if(enabled===nativeWorkspacePreference())return;
  window.localStorage.setItem(workspacePreference,enabled?'1':'0');
}

export function nativeWorkspaceRequested() {
  if(!window.__TAURI__?.core?.invoke)return false;
  const requested=new URLSearchParams(location.search).get('native-workspace');
  return requested===null?nativeWorkspacePreference()===true:requested==='1';
}

export function nativeOnlyAcceptance() {
  return Boolean(window.__TAURI__?.core?.invoke) &&
    (nativeWorkspaceRequested()||new URLSearchParams(location.search).get('native-only-acceptance')==='1');
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
