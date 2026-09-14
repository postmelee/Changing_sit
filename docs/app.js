(function () {
  'use strict';
  const CAPACITY = 40;
  const HEADERS = new Set(['이름','성명','학생명','학생이름','name','student','studentname']);
  const normalize = value => String(value ?? '').trim();
  const isHeader = value => HEADERS.has(normalize(value).replace(/\s/g, '').toLowerCase());
  const isName = value => typeof value === 'string' && normalize(value) !== '' && !/^\d+(?:\.\d+)?$/.test(normalize(value));
  const sampleNames = () => Array.from({ length: 38 }, (_, i) => `학생${String(i + 1).padStart(2, '0')}`);

  function readNames(rows) {
    const filled = rows.filter(row => row.some(value => normalize(value) !== ''));
    if (!filled.length) throw new Error('명렬표가 비어 있습니다.');
    let headerRow = -1, column = -1;
    for (let i = 0; i < Math.min(5, filled.length); i++) {
      const found = filled[i].findIndex(isHeader);
      if (found !== -1) { headerRow = i; column = found; break; }
    }
    let data = filled;
    if (headerRow >= 0) data = filled.slice(headerRow + 1);
    else {
      const first = filled[0];
      if (/^(번호|출석번호|학번|no\.?|number)$/i.test(normalize(first[0]))) data = filled.slice(1);
      const candidate = data.find(row => row.some(isName));
      if (!candidate) throw new Error('이름을 찾지 못했습니다. 이름 열 제목을 ‘이름’으로 작성해 주세요.');
      // Headerless name-only and number/name rosters, including the original blank-header format.
      column = candidate.findIndex(isName);
      const ambiguous = candidate.filter(isName).length > 1;
      if (ambiguous) throw new Error('이름 열이 여러 개로 보입니다. 이름 열 제목을 ‘이름’으로 작성해 주세요.');
    }
    const values = data.map(row => row[column]).filter(value => normalize(value) !== '');
    if (values.some(value => !isName(value))) throw new Error('이름 열에 숫자만 있는 항목이 있습니다. 명렬표를 확인해 주세요.');
    const names = values.map(normalize);
    if (!names.length) throw new Error('이름을 찾지 못했습니다.');
    if (names.length > CAPACITY) throw new Error(`최대 ${CAPACITY}명까지 배치할 수 있습니다. 현재 ${names.length}명입니다.`);
    if (names.some(name => name.length > 30)) throw new Error('이름은 30자 이내로 작성해 주세요.');
    return names;
  }

  function mixed(max, random = Math.random) {
    const array = Array.from({ length: max }, (_, i) => i);
    for (let i = array.length; i; i--) {
      const j = Math.floor(random() * i);
      [array[i - 1], array[j]] = [array[j], array[i - 1]];
    }
    return array;
  }
  function makePlacement(names, random = Math.random) {
    const result = Array(CAPACITY).fill('');
    const positions = mixed(names.length, random), students = mixed(names.length, random);
    positions.forEach((seat, i) => { result[seat] = names[students[i]]; });
    return result;
  }
  // Pure helpers are exported only for Node's built-in test runner.
  if (typeof module !== 'undefined' && module.exports) { module.exports = { readNames, makePlacement, mixed, sampleNames }; return; }
  const byId = id => document.getElementById(id);
  const groups = byId('groups'), status = byId('status');
  let names = [], seats = Array(CAPACITY).fill(''), reverse = false, timer = null, run = 0, importRun = 0;
  const cells = [];
  for (let group = 0; group < 4; group++) {
    const wrapper = document.createElement('div'); wrapper.className = 'seat-group';
    for (let i = 0; i < 10; i++) {
      const cell = document.createElement('div'); cell.className = 'seat';
      wrapper.append(cell); cells.push(cell);
    }
    groups.append(wrapper);
  }
  function announce(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function render(highlight = -1) {
    cells.forEach((cell, displayIndex) => {
      const index = reverse ? CAPACITY - 1 - displayIndex : displayIndex;
      cell.textContent = seats[index]; cell.classList.toggle('highlight', index === highlight);
      cell.setAttribute('aria-label', `${index + 1}번 자리 ${seats[index] || '비어 있음'}`);
    });
    byId('classroom').classList.toggle('reversed', reverse);
  }
  function stop() { run++; clearTimeout(timer); timer = null; }
  function installRoster(next, label) {
    stop(); names = next; seats.fill(''); render();
    byId('shuffle').disabled = byId('slow').disabled = false;
    announce(`${label} · ${names.length}명. ‘자리 바꾸기’를 눌러 주세요.`);
  }
  byId('sample').addEventListener('click', () => { importRun++; installRoster(sampleNames(), '예시 명렬표'); });
  byId('file-object').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const ticket = ++importRun;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 명렬표를 선택해 주세요.');
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('xlsx, xls, csv 파일을 선택해 주세요.');
      const bytes = await file.arrayBuffer(); if (ticket !== importRun) return;
      const workbook = window.XLSX.read(bytes, { type: 'array' });
      if (!workbook.SheetNames.length) throw new Error('시트가 없는 파일입니다.');
      const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: true });
      installRoster(readNames(rows), file.name);
    } catch (error) { if (ticket === importRun) announce(error.message || '명렬표를 읽지 못했습니다.', true); }
    event.target.value = '';
  });
  byId('shuffle').addEventListener('click', () => { if (!names.length) return; stop(); seats = makePlacement(names); render(); announce(`${names.length}명의 자리 배치가 완료되었습니다.`); });
  byId('slow').addEventListener('click', () => {
    if (!names.length) return;
    stop(); const token = run, target = makePlacement(names), order = mixed(names.length); let index = 0;
    seats.fill(''); render(); announce('한 명씩 공개합니다. 초기화를 누르면 멈춥니다.');
    function reveal() {
      if (token !== run) return;
      const seat = order[index++]; seats[seat] = target[seat]; render(seat);
      if (index < order.length) timer = setTimeout(reveal, 1000);
      else { timer = setTimeout(() => { if (token === run) render(); }, 1000); announce(`${names.length}명의 자리 배치가 완료되었습니다.`); }
    }
    timer = setTimeout(reveal, 1000);
  });
  byId('pairs').addEventListener('click', () => {
    importRun++; stop(); const sample = sampleNames(), pairs = mixed(19); seats.fill('');
    pairs.forEach((pair, i) => { seats[i * 2] = sample[pair * 2]; seats[i * 2 + 1] = sample[pair * 2 + 1]; });
    render(); announce('예시 멘토·멘티 19쌍을 배치했습니다. 이 모드는 예시 이름만 사용합니다.');
  });
  byId('reverse').addEventListener('click', () => { reverse = !reverse; render(); });
  byId('clear').addEventListener('click', () => { importRun++; stop(); seats.fill(''); render(); announce(names.length ? '자리를 비웠습니다. 명렬표는 유지됩니다.' : '자리를 비웠습니다. 예시 명렬표 또는 엑셀을 불러오세요.'); });
  render();
})();
