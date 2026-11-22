import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function validateVersion(versions,tag){
  const values=Object.values(versions),version=values[0];
  if(!version||values.some(value=>value!==version))throw new Error('Release version manifests do not match: '+JSON.stringify(versions));
  const pattern=/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  if(tag && !pattern.test(tag))throw new Error('Invalid release tag: '+tag);
  if(tag && tag!==`v${version}`)throw new Error(`Release tag ${tag} does not match application version ${version}`);
  return version;
}

export function releasePlan({tag='',versions,checksOnly=false,allowUnsigned=false,hasCertificate=false}){
  const version=validateVersion(versions,tag);
  if(!tag)return {version,requested:false,tag:'',prerelease:false,unsigned:!hasCertificate};
  if(checksOnly)throw new Error('A release cannot be published in checks-only mode');
  if(!hasCertificate&&!tag.includes('preview')&&!allowUnsigned)throw new Error('Formal Windows releases require a signing certificate or an explicit allow_unsigned request');
  return {version,requested:true,tag,prerelease:version.includes('-'),unsigned:!hasCertificate};
}

export function macosReleasePlan({event,ref,versions}){
  const tag=event==='push' && ref?.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : '';
  const version=validateVersion(versions,tag);
  return {version,requested:Boolean(tag),tag,prerelease:Boolean(tag && version.includes('-'))};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const json=path=>JSON.parse(readFileSync(path,'utf8'));
  const desktop=json('apps/desktop/package.json'),lock=json('apps/desktop/package-lock.json');
  const cargo=readFileSync('apps/desktop/src-tauri/Cargo.toml','utf8');
  const cargoLock=readFileSync('apps/desktop/src-tauri/Cargo.lock','utf8');
  const versions={desktop:desktop.version,npmLock:lock.version,npmPackageLock:lock.packages[''].version,tauri:json('apps/desktop/src-tauri/tauri.conf.json').version,cargo:cargo.match(/^version = "([^"]+)"/m)?.[1],cargoLock:cargoLock.match(/\[\[package\]\]\r?\nname = "lineae"\r?\nversion = "([^"]+)"/)?.[1]};
  const tag=process.env.RELEASE_TAG||(process.env.GITHUB_REF?.startsWith('refs/tags/v')?process.env.GITHUB_REF_NAME:'');
  const macos=process.argv.includes('--macos');
  const plan=macos ? macosReleasePlan({event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,versions})
    : releasePlan({tag,versions,checksOnly:process.env.CHECKS_ONLY==='true',allowUnsigned:process.env.ALLOW_UNSIGNED==='true',hasCertificate:process.env.CERTIFICATE_AVAILABLE==='true'});
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(plan).map(([key,value])=>key+'='+value).join('\n')+'\n');
  console.log('Version '+plan.version+' verified; publication '+(plan.requested?'requested ('+(macos?'ad-hoc signed':plan.unsigned?'unsigned':'signed')+')':'not requested'));
}
