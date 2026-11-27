// Chinese numerals for ctex/zhnumber counters. Algorithmic (not a lookup table).
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const UNITS = ['', '十', '百', '千'];
const BIG_UNITS = ['', '万', '亿', '万亿', '亿亿'];

function group4(value) {
  let text = '';
  let pendingZero = false;
  for (let unit = 3; unit >= 0; unit--) {
    const digit = Math.floor(value / 10 ** unit) % 10;
    if (digit) {
      if (pendingZero) { text += DIGITS[0]; pendingZero = false; }
      text += DIGITS[digit] + UNITS[unit];
    } else if (text) {
      pendingZero = true;
    }
  }
  return text;
}

export function chineseNumber(value) {
  let number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return String(value);
  if (number === 0) return DIGITS[0];
  const negative = number < 0;
  number = Math.abs(number);
  const groups = [];
  while (number > 0) {
    groups.push(number % 10000);
    number = Math.floor(number / 10000);
  }
  const highest = groups.length - 1;
  let text = '';
  for (let index = highest; index >= 0; index--) {
    const group = groups[index];
    if (group === 0) {
      if (text && !text.endsWith(DIGITS[0])) text += DIGITS[0];
      continue;
    }
    if (text && group < 1000 && !text.endsWith(DIGITS[0])) text += DIGITS[0];
    let part = group4(group);
    // 10..19 at the most significant group omit the leading 一 (十, 十一).
    if (index === highest && part.startsWith('一十')) part = part.slice(1);
    text += part + BIG_UNITS[index];
  }
  return (negative ? '负' : '') + text.replace(/零+$/, '');
}
