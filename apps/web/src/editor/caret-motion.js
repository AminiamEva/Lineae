import { createSelectionMotion, measureSelection, projectRect } from './selection-motion.js';

const MOVE_EASING = 'cubic-bezier(.22,.62,.27,1)';
const EDIT_EASING = 'cubic-bezier(.14,.75,.25,1)';
const BLINK_FRAMES = [
  { opacity: 1, offset: 0 }, { opacity: 1, offset: .46, easing: 'ease-in-out' },
  { opacity: 0, offset: .55 }, { opacity: 0, offset: .91, easing: 'ease-in-out' },
  { opacity: 1, offset: 1 },
];

const isCaretRect = rect => rect && rect.bottom > rect.top && rect.right - rect.left < 2;

export function measurePage(page) {
  const pageRect = page.getBoundingClientRect();
  const zoom = page.currentCSSZoom || Number.parseFloat(getComputedStyle(page).zoom) ||
    (page.offsetWidth ? pageRect.width / page.offsetWidth : 1);
  return { pageRect, zoom };
}

function caretPlacement(view, selection, rowDirection, previousTop, preferred) {
  const focus = view.dom.ownerDocument.createRange();
  focus.setStart(selection.focusNode, selection.focusOffset);
  focus.collapse(true);
  const native = { rect: [...focus.getClientRects()].find(isCaretRect), affinity: 'native' };
  if (native.rect && !preferred && (!rowDirection || previousTop === undefined)) return native;

  // At a soft wrap the same document offset can be either the end of one
  // visual line or the start of the next. Preserve native selection endpoints
  // and use the arrow direction only to disambiguate where to paint the caret.
  const position = view.posAtDOM(selection.focusNode, selection.focusOffset);
  if (position < 0 || position > view.state.doc.content.size || !view.state.doc.resolve(position).parent.isTextblock) return native;
  const forward = { rect: view.coordsAtPos(position, 1), affinity: 'forward' };
  const backward = { rect: view.coordsAtPos(position, -1), affinity: 'backward' };
  const placements = [native, forward, backward].filter(placement => isCaretRect(placement.rect));
  const differentRows = Math.max(forward.rect.top, backward.rect.top) >= Math.min(forward.rect.bottom, backward.rect.bottom) - 1;
  if (rowDirection && previousTop !== undefined && differentRows) {
    const candidates = placements.filter(({ rect }) => rowDirection * (rect.top - previousTop) > 4);
    candidates.sort((a, b) => Math.abs(a.rect.top - previousTop) - Math.abs(b.rect.top - previousTop));
    if (candidates.length) return candidates[0];
  }
  return placements.find(placement => placement.affinity === preferred) ?? placements[0] ?? native;
}

function inViewport(rect, win) {
  return rect.right >= 0 && rect.left < win.innerWidth && rect.bottom > 0 && rect.top < win.innerHeight;
}

const near = (a, b) => Math.abs(a - b) < .02;
function sameCaret(a, b) {
  if (!a || !b) return a === b;
  return near(a.x, b.x) && near(a.y, b.y) && near(a.height, b.height) &&
    a.edge?.side === b.edge?.side && a.edge?.edge === b.edge?.edge;
}

function caretStyle({ x, y, height }) {
  return { transform: `translate(${x}px, ${y}px)`, height: `${height}px` };
}

function editOrigin(from, to) {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const xLimit = Math.min(14, to.height * .7);
  const yLimit = to.height * .65;
  return {
    x: to.x + (Math.abs(dy) > yLimit && Math.abs(dx) > to.height * 2 ? 0 : Math.max(-xLimit, Math.min(xLimit, dx))),
    y: to.y + Math.max(-yLimit, Math.min(yLimit, dy)),
    height: Math.min(from.height, to.height * 1.25),
  };
}

export function createCaretMotion(view, page) {
  const doc = page.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = win.matchMedia('(forced-colors: active)');
  const caret = doc.createElement('span');
  caret.className = 'document-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.hidden = true;
  page.append(caret);
  const selectionMotion = createSelectionMotion(view, page);

  let target = null;
  let lastZoom = null;
  let preparedEdit = null;
  let glide = null;
  let blink = null;

  function stopGlide() {
    const previous = glide;
    glide = null;
    previous?.cancel();
  }

  function restartBlink(steady = false) {
    blink ??= caret.animate(BLINK_FRAMES, { id: 'lineae-caret-blink', duration: 1040, iterations: Infinity });
    blink.currentTime = 0;
    if (steady) blink.pause();
    else blink.play();
  }

  function hide() {
    preparedEdit = null;
    if (lastZoom === null) return;
    target = null;
    lastZoom = null;
    stopGlide();
    blink?.cancel();
    selectionMotion.clear();
    caret.hidden = true;
    view.dom.classList.remove('has-document-caret');
  }

  function nativeSelection() {
    const selection = doc.getSelection();
    return selection?.rangeCount === 1 && view.dom.contains(selection.anchorNode) &&
      view.dom.contains(selection.focusNode) ? selection : null;
  }

  function prepareEdit() {
    if (target || preparedEdit || reducedMotion.matches || forcedColors.matches || page.dataset.caretMotion === 'false') return;
    const native = nativeSelection();
    const rect = native && caretPlacement(view, native).rect;
    if (rect) {
      const { pageRect, zoom } = measurePage(page);
      preparedEdit = { rect: projectRect(rect, pageRect, zoom), zoom };
    }
  }

  function update({ pageRect, zoom, boxEdge, blocked, intent, edited, activity, rowDirection, retainSelection }) {
    const origin = preparedEdit;
    preparedEdit = null;
    const focused = view.hasFocus();
    const animated = page.dataset.caretMotion !== 'false' && !reducedMotion.matches &&
      !forcedColors.matches && typeof caret.animate === 'function';
    if (blocked || view.composing || !view.editable || !doc.hasFocus() || doc.hidden ||
        (!focused && !retainSelection) || (!animated && !boxEdge) || !pageRect.width || !pageRect.height) return hide();

    const native = nativeSelection();
    const model = view.state.selection;
    const node = model.node && view.nodeDOM(model.from);
    const selectedNode = node?.nodeType === Node.ELEMENT_NODE ? node : null;
    if ((!native && !selectedNode) || (model.visible === false && !selectedNode)) return hide();
    const selection = animated ? measureSelection(view, native, pageRect, zoom, selectedNode) : { rects: [], active: false, backward: false };
    const previousTop = target && lastZoom === zoom ? pageRect.top + target.y * zoom : undefined;
    const sameFocus = target && native && target.focusNode === native.focusNode && target.focusOffset === native.focusOffset;
    const preferred = rowDirection === undefined && sameFocus && target.affinity !== 'native' ? target.affinity : undefined;
    const placement = focused && !selectedNode && (boxEdge ?? caretPlacement(view, native, rowDirection, previousTop, preferred));
    const next = placement?.rect ? {
      ...projectRect(placement.rect, pageRect, zoom), edge: boxEdge,
      focusNode: native.focusNode, focusOffset: native.focusOffset, affinity: placement.affinity,
    } : null;
    if (!next && !selection.active) return hide();

    const selectionChanged = !selectionMotion.matches(selection);
    const caretChanged = !sameCaret(target, next);
    if (lastZoom === zoom && !selectionChanged && !caretChanged && !edited) {
      target = next;
      if (activity && next && animated && !glide) restartBlink(selection.active);
      return;
    }

    // Retarget from the pixels already on screen. Zoom changes always use
    // fresh layout measurements, so an old glide cannot skew the new bounds.
    let from = null;
    if (animated && intent && (lastZoom === zoom || origin?.zoom === zoom)) {
      if (target) {
        const painted = caret.getBoundingClientRect();
        if (inViewport(painted, win)) from = projectRect(painted, pageRect, zoom);
      }
      if (!from && origin?.zoom === zoom) from = origin.rect;
    }
    const editing = intent === 'edit';
    if (from && next && editing) from = editOrigin(from, next);
    // A click on a boxed mark must distinguish the two sides of its border
    // immediately. Changes in its text can still move the caret with the edit.
    if (!editing && (boxEdge || target?.edge)) from = null;
    const distance = from && next ? Math.hypot(next.x - from.x, next.y - from.y) : 0;
    const moves = from && next && (distance >= .3 || Math.abs(from.height - next.height) >= .3);
    const pulse = Boolean(edited && next && !moves);
    const layoutStable = lastZoom === null || lastZoom === zoom;
    const timing = animated && layoutStable && intent && (moves || pulse || (selectionChanged && (lastZoom === zoom || from))) ? {
      duration: editing ? 55 : Math.min(150, 105 + distance * .12),
      easing: editing ? EDIT_EASING : MOVE_EASING,
      fill: 'backwards',
    } : null;

    stopGlide();
    lastZoom = zoom;
    target = next;
    caret.hidden = !next;
    caret.classList.toggle('box-edge-caret', Boolean(next?.edge));
    view.dom.classList.toggle('has-document-caret', Boolean(next));
    if (next) {
      if (next.edge) {
        caret.dataset.side = next.edge.side;
        caret.dataset.edge = next.edge.edge;
      }
      caret.style.width = `${next.edge ? 1 : 1.5 / zoom}px`;
      Object.assign(caret.style, caretStyle(next));
    }

    const startTime = doc.timeline.currentTime;
    selectionMotion.draw(selection, { pageRect, zoom, from, to: next, timing, startTime });
    if (!next || !animated) { blink?.cancel(); return; }
    if (!timing || (!moves && !pulse)) { restartBlink(selection.active); return; }

    restartBlink(true);
    const keyframes = moves ? [caretStyle(from), caretStyle(next)] : [{ opacity: .75 }, { opacity: 1 }];
    const animation = caret.animate(keyframes, { ...timing, id: 'lineae-caret-glide' });
    animation.startTime = startTime;
    glide = animation;
    animation.onfinish = () => {
      if (glide !== animation) return;
      glide = null;
      restartBlink(selection.active);
    };
  }

  return {
    update, hide, prepareEdit,
    watchPreferences(schedule, signal) {
      reducedMotion.addEventListener('change', schedule, { signal });
      forcedColors.addEventListener('change', schedule, { signal });
    },
    destroy() { hide(); selectionMotion.destroy(); caret.remove(); },
  };
}
