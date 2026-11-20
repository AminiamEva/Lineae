import { t } from './i18n.mjs';
import { icon } from '../editor/icons.js';

let openFlyout = null;

function closeFlyout() {
  if (!openFlyout) return;
  const {state, flyout} = openFlyout;
  openFlyout = null;
  flyout.remove();
  state.section.insertBefore(state.body, state.label);
  state.body.inert = state.section.classList.contains('is-collapsed');
  state.body.setAttribute('aria-hidden', String(state.body.inert));
  state.toggle.setAttribute('aria-expanded', 'false');
}

function openGroupFlyout(state) {
  if (openFlyout?.state === state) {
    closeFlyout();
    return;
  }
  closeFlyout();
  const flyout = document.createElement('div');
  flyout.className = 'home-ribbon ribbon-flyout';
  flyout.setAttribute('role', 'dialog');
  flyout.setAttribute('aria-label', t(state.zh, state.en));
  const title = document.createElement('div');
  title.className = 'ribbon-flyout-title';
  title.textContent = t(state.zh, state.en);
  flyout.append(title, state.body);
  state.body.inert = false;
  state.body.removeAttribute('aria-hidden');
  document.body.append(flyout);
  flyout.style.width = Math.min(320, window.innerWidth - 16) + 'px';
  const anchor = state.toggle.getBoundingClientRect();
  const groupBounds = state.section.getBoundingClientRect();
  const size = flyout.getBoundingClientRect();
  const left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - size.width - 8));
  let top = groupBounds.bottom + 4;
  if (top + size.height > window.innerHeight - 8) top = Math.max(8, groupBounds.top - size.height - 4);
  flyout.style.left = left + 'px';
  flyout.style.top = top + 'px';
  openFlyout = {state, flyout};
  state.toggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => flyout.classList.add('is-open'));
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    if (!openFlyout) return;
    if (openFlyout.flyout.contains(event.target) || openFlyout.state.toggle.contains(event.target)) return;
    closeFlyout();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openFlyout) {
      event.preventDefault();
      closeFlyout();
    }
  }, true);
  window.addEventListener('resize', () => closeFlyout());
  window.addEventListener('scroll', () => closeFlyout(), true);
}

export function createRibbonGroup(panel, {id, zh, en, iconName = 'layout', width = 240}) {
  const section = document.createElement('section');
  section.className = 'ribbon-group';
  section.dataset.ribbonGroup = id;
  section.style.width = width + 'px';
  const body = document.createElement('div');
  body.className = 'ribbon-group-body';
  const label = document.createElement('div');
  label.className = 'ribbon-group-label';
  label.dataset.zh = zh;
  label.dataset.en = en;
  label.textContent = t(zh, en);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ribbon-group-toggle';
  toggle.setAttribute('aria-label', t(zh, en));
  toggle.title = t(zh, en);
  toggle.append(icon(iconName));
  const chevron = icon('chevronDown');
  chevron.classList.add('ribbon-group-chevron');
  toggle.append(chevron);
  toggle.addEventListener('mousedown', event => event.preventDefault());
  toggle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openGroupFlyout(state);
  });
  section.append(body, label, toggle);
  panel.append(section);
  const state = {id, zh, en, section, body, label, toggle};
  return state;
}

export function installResponsiveGroups(panel, states, priority = [...states].reverse().map(state => state.id)) {
  let fullWidths = null;
  let frame = 0;
  let observer = null;

  function availableWidth() {
    const width = window.innerWidth;
    const sidebar = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--sidebar-width')) || 0;
    const max = Math.min(1320, Math.max(300, width - sidebar - 160), width - sidebar - 24);
    return Math.max(0, max - 24);
  }

  function measure() {
    if (!panel.isConnected || panel.getBoundingClientRect().width < 2) return false;
    closeFlyout();
    for (const state of states) state.section.classList.remove('is-collapsed', 'is-compact');
    fullWidths = new Map(states.map(state => [state.id, state.section.getBoundingClientRect().width]));
    return true;
  }

  function apply() {
    frame = 0;
    if (!fullWidths && !measure()) return;
    closeFlyout();
    const available = availableWidth();
    const collapsed = new Set();
    let total = [...fullWidths.values()].reduce((sum, value) => sum + value, 0);
    for (const id of priority) {
      if (total <= available) break;
      total -= (fullWidths.get(id) ?? 0) - 84;
      collapsed.add(id);
    }
    let compact = false;
    if (total > available && collapsed.size === states.length) {
      compact = true;
      total -= collapsed.size * (84 - 40);
    }
    for (const state of states) {
      const isCollapsed = collapsed.has(state.id);
      state.section.classList.toggle('is-collapsed', isCollapsed);
      state.section.classList.toggle('is-compact', isCollapsed && compact);
      state.body.inert = isCollapsed;
      state.body.setAttribute('aria-hidden', String(isCollapsed));
      state.toggle.setAttribute('aria-expanded', String(openFlyout?.state === state));
      if (isCollapsed && compact) state.label.setAttribute('aria-hidden', 'true');
      else state.label.removeAttribute('aria-hidden');
    }
    panel.dataset.collapsedGroups = String(collapsed.size);
    panel.dataset.compactGroups = String(compact);
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  }

  observer = new ResizeObserver(schedule);
  observer.observe(panel);
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
  return {
    refresh: schedule,
    disconnect() {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    },
  };
}

export function buildRibbonGroups(panel, definitions, priority) {
  panel.classList.add('home-ribbon');
  const states = definitions.map(definition => {
    const state = createRibbonGroup(panel, definition);
    state.body.append(definition.body);
    return state;
  });
  const responsive = installResponsiveGroups(panel, states, priority);
  panel.refreshLayout = responsive.refresh;
  return states;
}
