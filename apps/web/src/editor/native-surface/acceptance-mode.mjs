export function nativeWorkspaceRequested() {
  return Boolean(window.__TAURI__?.core?.invoke)&&
    new URLSearchParams(location.search).get('native-workspace')==='1';
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
