// Local recovery is a best-effort crash checkpoint, never an automatic disk save.
export class RecoveryStore {
  constructor(storage, root) { this.storage=storage; this.key='lineae:project-recovery:v1:'+root; }
  read() {
    const raw=this.storage.getItem(this.key);if(!raw)return [];
    const data=JSON.parse(raw);
    if(!Array.isArray(data) || data.some(file=>typeof file.path!=='string' || typeof file.saved!=='string' || typeof file.draft!=='string'))throw new Error('Invalid project recovery data');
    return data;
  }
  checkpoint(files) {
    const drafts=[...files].filter(file=>file.dirty).map(({path,saved,draft})=>({path,saved,draft}));
    if(drafts.length)this.storage.setItem(this.key,JSON.stringify(drafts));else this.storage.removeItem(this.key);
  }
}
