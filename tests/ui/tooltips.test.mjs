import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTooltipPosition,
  normalizeTooltip,
  parseTooltipDataset,
  tooltipText,
} from '../../apps/web/src/ui/tooltips.mjs';

test('tooltip labels normalize strings and bilingual objects', () => {
  assert.deepEqual(normalizeTooltip('  保存  '), { zh: '保存', en: '保存' });
  assert.deepEqual(normalizeTooltip({ zh: ' 保存 ', en: ' Save ' }), { zh: '保存', en: 'Save' });
  assert.deepEqual(normalizeTooltip(null), { zh: '', en: '' });
  assert.equal(tooltipText({ zh: '保存', en: 'Save' }, 'zh-CN'), '保存');
  assert.equal(tooltipText({ zh: '保存', en: 'Save' }, 'en'), 'Save');
  assert.equal(tooltipText({ zh: '', en: 'Save' }, 'zh-CN'), 'Save');
  assert.equal(tooltipText({ zh: '保存', en: '' }, 'en'), '保存');
});

test('tooltip dataset prefers explicit language fields', () => {
  assert.deepEqual(parseTooltipDataset({ tooltipZh: '标签', tooltipEn: 'Label' }), { zh: '标签', en: 'Label' });
  assert.deepEqual(parseTooltipDataset({ tooltip: 'Both' }), { zh: 'Both', en: 'Both' });
  assert.deepEqual(parseTooltipDataset({ tooltip: 'Both', tooltipEn: 'English' }), { zh: 'Both', en: 'English' });
  assert.deepEqual(parseTooltipDataset({}), { zh: '', en: '' });
});

test('tooltip position clamps to the viewport and flips above', () => {
  assert.deepEqual(
    clampTooltipPosition({ left: 980, top: 790, width: 100, height: 40 }, { width: 1000, height: 800 }),
    { left: 892, top: 744, placement: 'top' },
  );
  assert.deepEqual(
    clampTooltipPosition({ left: -50, top: 10, width: 100, height: 40 }, { width: 1000, height: 800 }),
    { left: 8, top: 16, placement: 'bottom' },
  );
  assert.deepEqual(
    clampTooltipPosition({ left: 500, top: 500, width: 100, height: 40 }, { width: 300, height: 300 }),
    { left: 192, top: 252, placement: 'top' },
  );
  assert.deepEqual(
    clampTooltipPosition({ left: 500, top: 10, bottom: 34, width: 100, height: 40 }, { width: 1000, height: 800 }),
    { left: 500, top: 40, placement: 'bottom' },
  );
});
