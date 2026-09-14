const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../docs/vendor/xlsx.full.min.js');
const { readNames, makePlacement, sampleNames } = require('../docs/app.js');

test('reads an actual workbook with the original blank name header', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['번호', null], [1, '가람'], [2, '나래']]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '명렬표');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(parsed.Sheets['명렬표'], { header: 1, defval: '', raw: true });
  assert.deepEqual(readNames(rows), ['가람', '나래']);
});
test('reads a named column after a title row without including metadata', () => {
  assert.deepEqual(readNames([['2학년 8반'], ['학년', '반', '이름'], [2, 8, '가람'], [2, 8, '나래']]), ['가람', '나래']);
});
test('preserves first student and duplicate names in a headerless roster', () => {
  assert.deepEqual(readNames([['가람'], ['나래'], ['가람']]), ['가람', '나래', '가람']);
});
test('rejects empty, ambiguous, and over-capacity rosters', () => {
  assert.throws(() => readNames([[]]), /비어/);
  assert.throws(() => readNames([['학교', '가람']]), /여러/);
  assert.throws(() => readNames([['이름'], ...Array.from({ length: 41 }, (_,i) => ['학생'+i])]), /최대 40/);
});
test('a full classroom preserves the roster and a 38-person class has two empty seats', () => {
  for (let trial = 0; trial < 20; trial++) {
    const names = sampleNames(); const seats = makePlacement(names);
    assert.equal(seats.length, 40);
    assert.equal(seats.filter(value => !value).length, 2);
    assert.deepEqual(seats.filter(Boolean).sort(), names.sort());
  }
});
