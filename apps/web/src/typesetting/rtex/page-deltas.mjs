// LayoutUpdate is a delta even when a newer warm paragraph is already on
// screen. Keep its pages as the base of the next full layout without ever
// presenting the older revision over newer ink.
export function completePageDeltas() {
  const pages=new Map();
  let revision=-1,version=-1;
  const accepts=stamp=>stamp.source_revision>revision ||
    (stamp.source_revision===revision && stamp.layout_version>=version);
  return {
    accepts,
    apply(message,visibleRevision){
      if(!accepts(message.versions))return null;
      for(const page of message.pages_changed??[])pages.set(page.page,page);
      for(const number of pages.keys())if(number>message.pages_total)pages.delete(number);
      if(pages.size!==message.pages_total)throw Error('Native layout is missing page geometry');
      revision=message.versions.source_revision;version=message.versions.layout_version;
      return revision>=visibleRevision?pages:null;
    },
    reset(){revision=-1;version=-1;pages.clear();},
  };
}
