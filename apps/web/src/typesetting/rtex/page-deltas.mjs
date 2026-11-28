// LayoutUpdate is a delta even when a newer warm paragraph is already on
// screen. Keep its pages as the base of the next full layout without ever
// presenting the older revision over newer ink.
export function completePageDeltas() {
  let pages=new Map();
  let revision=-1,version=-1;
  const accepts=stamp=>stamp.source_revision>revision ||
    (stamp.source_revision===revision && stamp.layout_version>=version);
  return {
    accepts,
    apply(message,visibleRevision){
      if(!accepts(message.versions))return null;
      const next=new Map(pages);
      for(const page of message.pages_changed??[])next.set(page.page,page);
      for(const number of next.keys())if(number>message.pages_total)next.delete(number);
      if(next.size!==message.pages_total || [...next.keys()].some(n=>!Number.isInteger(n)||n<1))
        throw Error('Native layout is missing page geometry');
      pages=next;
      revision=message.versions.source_revision;version=message.versions.layout_version;
      return revision>=visibleRevision?pages:null;
    },
    reset(){revision=-1;version=-1;pages=new Map();},
  };
}
