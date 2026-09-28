const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../docs/vendor/xlsx.full.min.js');
const { readNames, makePlacement, sampleNames, validateLayout, seatGroups } = require('../docs/app.js');

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
  assert.throws(() => readNames([['이름'], ...Array.from({ length: 145 }, (_,i) => ['학생'+i])]), /최대 144/);
});
test('a full classroom preserves the roster and a 38-person class has two empty seats', () => {
  for (let trial = 0; trial < 20; trial++) {
    const names = sampleNames(); const seats = makePlacement(names);
    assert.equal(seats.length, 40);
    assert.equal(seats.filter(value => !value).length, 2);
    assert.deepEqual(seats.filter(Boolean).sort(), names.sort());
  }
});
test('all supported classroom sizes preserve each student, including duplicate names', () => {
  for (let rows = 1; rows <= 12; rows++) for (let columns = 1; columns <= 12; columns++) {
    const capacity = validateLayout(rows, columns);
    const names = Array.from({length: capacity}, (_, i) => i % 2 ? '동명이인' : `학생${i}`);
    for (const count of [1, Math.ceil(capacity / 2), capacity]) {
      const roster = names.slice(0, count);
      const result = makePlacement(roster, Math.random, capacity);
      assert.equal(result.length, capacity);
      assert.deepEqual(result.filter(Boolean).sort(), roster.sort());
    }
  }
});
test('rejects invalid dimensions and insufficient seats without truncating names', () => {
  for (const value of [0, -1, 13, 1.5, NaN, Infinity]) {
    assert.throws(() => validateLayout(value, 5), /정수/);
    assert.throws(() => validateLayout(5, value), /정수/);
  }
  assert.throws(() => validateLayout(5, 7, 38), /38석 이상/);
  assert.throws(() => makePlacement(sampleNames(), Math.random, 35), /좌석은 35석/);
  assert.throws(() => makePlacement([], Math.random, 145), /1~144/);
});
test('random placement includes the entire grid, even when most seats are empty', () => {
  const result = makePlacement(['가람'], () => 0.99999, 12);
  assert.equal(result[0], '가람');
  const shifted = makePlacement(['가람'], () => 0, 12);
  assert.equal(shifted[1], '가람');
});
test('paired and individual grids contain each seat exactly once and reverse as a 180-degree rotation', () => {
  for (let rows = 1; rows <= 12; rows++) for (let columns = 1; columns <= 12; columns++) for (const paired of [true, false]) {
    const normal = seatGroups(rows, columns, paired);
    const reversed = seatGroups(rows, columns, paired, true);
    assert.deepEqual(normal.flatMap(g => g.indices).sort((a,b) => a-b), Array.from({length: rows * columns}, (_, i) => i));
    assert.deepEqual(reversed, [...normal].reverse().map(g => ({width: g.width, indices: [...g.indices].reverse()})));
    assert.equal(normal.reduce((sum,g) => sum + g.width, 0), columns);
  }
});
test('accepts rosters beyond the former 40-seat limit up to 144 names', () => {
  assert.equal(readNames([['이름'], ...Array.from({length:144}, (_, i) => [`학생${i}`])]).length, 144);
});
