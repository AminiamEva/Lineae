import { createSelectionMotion, measureSelection } from './selection-motion.js';

// The document selection is always owned by the browser and ProseMirror.
// This layer only paints a caret at that selection, including during a glide.
const MOVE_EASING = 'cubic-bezier(.22,.62,.27,1)';
const EDIT_EASING = 'cubic-bezier(.14,.75,.25,1)';
const BLINK_FRAMES = [
  { opacity:1, offset:0 }, { opacity:1, offset:.46, easing:'ease-in-out' },
  { opacity:0, offset:.55 }, { opacity:0, offset:.91, easing:'ease-in-out' },
  { opacity:1, offset:1 },
];

function caretRect(view, selection) {
  const cursor = view.state.selection.$head;
  const range = selection.getRangeAt(0);
  const focus = range.collapsed ? range : range.cloneRange();
  if (!range.collapsed) {
    focus.setStart(selection.focusNode,selection.focusOffset);
    focus.collapse(true);
  }
  // At a wrapped line or in mixed-direction text, prefer the browser's
  // actual collapsed range to guessing an edge from the document offset.
  const rect = focus.getBoundingClientRect();
  if (rect.height > 0 && rect.width < 2) return rect;
  // An element boundary beside an atomic widget can resolve to the widget's
  // entire height. Leave those positions to the browser.
  if ([cursor.nodeBefore,cursor.nodeAfter].some(node=>node && !node.isText)) return null;
  return view.coordsAtPos(cursor.pos);
}

function localRect(rect, pageRect, zoom) {
  return {
    x:(rect.left-pageRect.left)/zoom,
    y:(rect.top-pageRect.top)/zoom,
    height:(rect.bottom-rect.top)/zoom,
    zoom,
  };
}

function inViewport(rect, win) {
  return rect.right >= 0 && rect.left < win.innerWidth &&
    rect.bottom > 0 && rect.top < win.innerHeight;
}

function transform({ x, y }, scale = 1) {
  return `translate(${x}px, ${y}px) scaleY(${scale})`;
}

export function createCaretMotion(view, page) {
  const doc = page.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = win.matchMedia('(forced-colors: active)');
  const caret = doc.createElement('span');
  caret.className = 'document-caret';
  caret.setAttribute('aria-hidden','true');
  caret.hidden = true;
  page.append(caret);
  const selectionMotion = createSelectionMotion(view,page);

  let target = null;
  let glide = null;
  let blink = null;

  function stopGlide() {
    const previous = glide;
    glide = null;
    previous?.cancel();
  }

  function restartBlink(steady = false) {
    blink ??= caret.animate(BLINK_FRAMES, {
      id:'lineae-caret-blink', duration:1040, iterations:Infinity,
    });
    blink.currentTime = 0;
    if (steady) blink.pause();
    else blink.play();
  }

  function hide() {
    if (!target) return;
    target = null;
    stopGlide();
    blink?.cancel();
    selectionMotion.clear();
    caret.hidden = true;
    view.dom.classList.remove('has-document-caret');
  }

  function update({ pageRect, zoom, blocked, intent, activity }) {
    if (blocked || view.composing || !view.editable || !view.hasFocus() || !doc.hasFocus() || doc.hidden ||
        reducedMotion.matches || forcedColors.matches || typeof caret.animate !== 'function' ||
        !pageRect.width || !pageRect.height) return hide();

    const native = doc.getSelection();
    if (view.state.selection.$cursor === undefined || native?.rangeCount !== 1 ||
        !view.dom.contains(native.anchorNode) || !view.dom.contains(native.focusNode)) return hide();
    const rect = caretRect(view,native);
    if (!rect || rect.bottom <= rect.top) return hide();
    zoom = page.currentCSSZoom || zoom;
    const next = localRect(rect,pageRect,zoom);
    const selection = measureSelection(view,native,pageRect,zoom);
    if (!selection) return hide();
    const selectionChanged = !selectionMotion.matches(selection);
    const selected = Boolean(selection.rects.length);
    if (!selectionChanged && target && zoom === target.zoom && Math.abs(next.x-target.x) < .02 &&
        Math.abs(next.y-target.y) < .02 && Math.abs(next.height-target.height) < .02) {
      if (activity && !glide) restartBlink(selected);
      return;
    }

    // Read the displayed position before changing styles or canceling the
    // old animation. Rapid key repeats and clicks start at this exact point.
    let from = null;
    if (intent && target?.zoom === zoom && inViewport(rect,win)) {
      const painted = caret.getBoundingClientRect();
      if (inViewport(painted,win)) from = localRect(painted,pageRect,zoom);
    }
    const editing = intent === 'edit';
    if (from && editing) {
      // Typing must remain readable even when it interrupts a longer glide.
      // Limit the remaining travel to roughly one glyph on the edited line.
      if (Math.abs(next.y-from.y)>next.height/2) from=null;
      else {
        const limit=Math.min(14,next.height*.7);
        from.x=next.x+Math.max(-limit,Math.min(limit,from.x-next.x));
      }
    }
    stopGlide();
    target = next;
    caret.style.width = `${1.5/next.zoom}px`;
    caret.style.height = `${next.height}px`;
    caret.style.transform = transform(next);
    caret.hidden = false;
    view.dom.classList.add('has-document-caret');

    const distance = from ? Math.hypot(next.x-from.x,next.y-from.y) : 0;
    const timing = from && (distance >= .5 || selectionChanged) ? {
      duration:editing ? 55 : Math.min(150,105+distance*.12),
      easing:editing ? EDIT_EASING : MOVE_EASING,
      fill:'backwards',
    } : null;
    const startTime = doc.timeline.currentTime;
    selectionMotion.draw(selection,{pageRect,zoom,from,to:next,timing,startTime});
    if (!timing) {
      restartBlink(selected);
      return;
    }
    restartBlink(true);
    const animation = caret.animate([
      { transform:transform(from, from.height/next.height) },
      { transform:transform(next) },
    ], { ...timing,id:'lineae-caret-glide' });
    animation.startTime = startTime;
    glide = animation;
    animation.onfinish = () => {
      if (glide !== animation) return;
      glide = null;
      restartBlink(selected);
    };
  }

  return {
    update, hide,
    watchPreferences(schedule, signal) {
      reducedMotion.addEventListener('change',schedule,{ signal });
      forcedColors.addEventListener('change',schedule,{ signal });
    },
    destroy() { hide(); selectionMotion.destroy(); caret.remove(); },
  };
}
