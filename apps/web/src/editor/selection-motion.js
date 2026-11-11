export function projectRect(rect, pageRect, zoom) {
  return {
    x: (rect.left - pageRect.left) / zoom,
    y: (rect.top - pageRect.top) / zoom,
    width: (rect.right - rect.left) / zoom,
    height: (rect.bottom - rect.top) / zoom,
  };
}

const near = (a, b) => Math.abs(a - b) < .02;
const sameBand = (a, b) => near(a.y, b.y) && near(a.height, b.height);
const touches = (a, b) => Math.max(a.x, b.x) <= Math.min(a.x + a.width, b.x + b.width) + .25;
const sameRect = (a, b) => a.object === b.object && sameBand(a, b) && near(a.x, b.x) && near(a.width, b.width);
const isObject = node => node.matches('[contenteditable="false"], hr, img');
const isDecoration = node => node.matches('.label-node, .ProseMirror-widget');

function appendRects(rects, bounds, pageRect, zoom, object) {
  for (const rect of bounds) {
    if (rect.width > 0 && rect.height > 0) rects.push({ ...projectRect(rect, pageRect, zoom), object });
  }
}

// Range.getClientRects() includes block element boxes. Measure text runs and
// selected atomic nodes separately so neither page margins nor paragraph marks
// become part of a text highlight.
function measureRange(range, pageRect, zoom, rects) {
  const root = range.commonAncestorContainer;
  const segment = root.ownerDocument.createRange();
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!range.intersectsNode(node)) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      segment.setStart(node, node === range.startContainer ? range.startOffset : 0);
      segment.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
      appendRects(rects, segment.getClientRects(), pageRect, zoom);
    } else if (node.nodeType === Node.ELEMENT_NODE && !isDecoration(node)) {
      if (isObject(node)) {
        // A formula or image participates as one object in a document range.
        appendRects(rects, node.getClientRects(), pageRect, zoom, node);
      } else {
        for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child);
      }
    }
  }
}

export function measureSelection(view, native, pageRect, zoom, selectedNode = null) {
  const rects = [];
  if (selectedNode) {
    if (!isDecoration(selectedNode)) appendRects(rects, selectedNode.getClientRects(), pageRect, zoom, selectedNode);
    return { rects, active: true, backward: false };
  }
  const range = native.getRangeAt(0);
  if (!range.collapsed) measureRange(range, pageRect, zoom, rects);
  const extra = view.dom.querySelectorAll('.lineae-multi-selected');
  for (const element of extra) {
    const fragment = view.dom.ownerDocument.createRange();
    fragment.selectNodeContents(element);
    measureRange(fragment, pageRect, zoom, rects);
  }
  rects.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  const objects = new Set();
  for (const rect of rects) {
    const previous = merged.at(-1);
    if (rect.object) {
      if (objects.has(rect.object) && merged.some(part => sameRect(part, rect))) continue;
      objects.add(rect.object);
    } else if (previous && !previous.object && sameBand(rect, previous) && touches(rect, previous)) {
      previous.width = Math.max(previous.x + previous.width, rect.x + rect.width) - previous.x;
      continue;
    }
    merged.push(rect);
  }
  const backward = native.direction === 'backward' ||
    (native.focusNode === range.startContainer && native.focusOffset === range.startOffset);
  return { rects: merged, active: !range.collapsed || extra.length > 0, backward };
}

const emptySelection = () => ({ rects: [], active: false, backward: false });
const rowKey = rect => rect.object ?? Math.round(rect.y * 2);

function styleRect({ x, y, width, height, opacity = 1 }) {
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, opacity };
}

function collapsed(rect, point, atRight) {
  if (rect.object) return { ...rect, opacity: 0 };
  const sameLine = point && Math.abs(rect.y - point.y) < Math.min(rect.height, point.height) / 2;
  const x = sameLine ? Math.min(rect.x + rect.width, Math.max(rect.x, point.x)) : rect.x + (atRight ? rect.width : 0);
  return { ...rect, x, width: 0 };
}

export function createSelectionMotion(view, page) {
  const layer = page.ownerDocument.createElement('div');
  layer.className = 'document-selection';
  layer.setAttribute('aria-hidden', 'true');
  page.append(layer);
  let last = emptySelection();
  let painted = [];

  function clear() {
    layer.replaceChildren();
    painted = [];
    last = emptySelection();
    view.dom.classList.remove('has-document-selection');
  }

  function matches(next) {
    return last.active === next.active && last.rects.length === next.rects.length &&
      next.rects.every((rect, i) => sameRect(rect, last.rects[i]));
  }

  function draw(next, { pageRect, zoom, from, to, timing, startTime }) {
    const previousRows = new Map();
    if (timing) {
      for (const { element, rect } of painted) {
        if (!element.isConnected) continue;
        const bounds = projectRect(element.getBoundingClientRect(), pageRect, zoom);
        if (bounds.width <= .02) continue;
        const origin = { ...bounds, object: rect.object };
        if (rect.object) origin.opacity = Number(getComputedStyle(element).opacity);
        const key = rowKey(origin);
        const row = previousRows.get(key) ?? [];
        row.push(origin);
        previousRows.set(key, row);
      }
    }
    const parts = next.rects.map(rect => {
      const row = previousRows.get(rowKey(rect));
      const index = row?.findIndex(previous => touches(previous, rect)) ?? -1;
      const origin = index < 0 ? collapsed(rect, from, next.backward) : row.splice(index, 1)[0];
      return { origin, rect, exit: false };
    });
    for (const row of previousRows.values()) {
      for (const origin of row) parts.push({ origin, rect: collapsed(origin, to, !last.backward), exit: true });
    }

    last = next;
    const fragment = layer.ownerDocument.createDocumentFragment();
    painted = parts.map(part => {
      const element = layer.ownerDocument.createElement('span');
      if (part.rect.object) element.dataset.selectionObject = '';
      Object.assign(element.style, styleRect(part.rect));
      fragment.append(element);
      return { ...part, element };
    });
    layer.replaceChildren(fragment);
    view.dom.classList.toggle('has-document-selection', next.active);
    if (!timing) return;
    for (const { element, origin, rect, exit } of painted) {
      if (sameRect(origin, rect) && near(origin.opacity ?? 1, rect.opacity ?? 1)) {
        if (exit) element.remove();
        continue;
      }
      const animation = element.animate([styleRect(origin), styleRect(rect)], {
        ...timing, id: 'lineae-selection-glide',
      });
      if (startTime !== null) animation.startTime = startTime;
      if (exit) animation.onfinish = () => element.remove();
    }
  }

  return { clear, matches, draw, destroy() { clear(); layer.remove(); } };
}
