(function () {
  'use strict';
  const MAX_CAPACITY = 144;
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
    if (names.length > MAX_CAPACITY) throw new Error(`최대 ${MAX_CAPACITY}명까지 배치할 수 있습니다. 현재 ${names.length}명입니다.`);
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
  function makePlacement(names, random = Math.random, capacity = 40) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) throw new Error('좌석 수는 1~144석이어야 합니다.');
    if (names.length > capacity) throw new Error(`학생은 ${names.length}명인데 좌석은 ${capacity}석입니다. 교실 설정에서 좌석을 늘려 주세요.`);
    const result = Array(capacity).fill('');
    const positions = mixed(capacity, random), students = mixed(names.length, random);
    students.forEach((student, i) => { result[positions[i]] = names[student]; });
    return result;
  }
  function validateLayout(rows, columns, count = 0) {
    if (![rows, columns].every(value => Number.isInteger(value) && value >= 1 && value <= 12)) throw new Error('행과 열은 각각 1~12 사이의 정수로 입력해 주세요.');
    if (rows * columns < count) throw new Error(`학생 ${count}명을 배치하려면 ${count}석 이상이 필요합니다. 명렬표와 현재 자리는 유지됩니다.`);
    return rows * columns;
  }
  function seatGroups(rows, columns, paired, reverse = false) {
    const result = [], width = paired ? 2 : 1;
    const starts = Array.from({ length: Math.ceil(columns / width) }, (_, i) => i * width);
    if (reverse) starts.reverse();
    for (const start of starts) {
      const groupColumns = Array.from({ length: Math.min(width, columns - start) }, (_, i) => start + i);
      if (reverse) groupColumns.reverse();
      const indices = [];
      for (let row = 0; row < rows; row++) {
        for (const column of groupColumns) indices.push((reverse ? rows - row - 1 : row) * columns + column);
      }
      result.push({ width: groupColumns.length, indices });
    }
    return result;
  }
  // Pure helpers are exported only for Node's built-in test runner.
  if (typeof module !== 'undefined' && module.exports) { module.exports = { readNames, makePlacement, validateLayout, seatGroups, mixed, sampleNames }; return; }
  const byId = id => document.getElementById(id);
  const groups = byId('groups'), status = byId('status'), workspace = byId('workspace');
  let rows = 5, columns = 8, paired = true;
  let names = [], seats = Array(40).fill(''), reverse = false, timer = null, run = 0, importRun = 0;
  let cells = [];
  const backgroundMusic = byId('background-music'), endingSound = byId('ending-sound');
  let soundEnabled = true, revealing = false;
  function silence() {
    for (const audio of [backgroundMusic, endingSound]) { audio.pause(); audio.currentTime = 0; }
  }
  function playAudio(audio) {
    if (!soundEnabled) return;
    const token = run;
    audio.play().catch(error => {
      if (token === run && soundEnabled && error.name !== 'AbortError') byId('sound-status').textContent = '음악을 재생하지 못했습니다. 자리 배치는 계속됩니다.';
    });
  }
  byId('sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    byId('sound').textContent = soundEnabled ? '소리 켜짐' : '소리 꺼짐';
    byId('sound').setAttribute('aria-pressed', String(soundEnabled));
    byId('sound-status').textContent = '';
    if (!soundEnabled) silence();
    else if (revealing) playAudio(backgroundMusic);
  });
  const capacity = () => rows * columns;
  function announce(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function buildGrid() {
    groups.replaceChildren(); cells = [];
    const layout = seatGroups(rows, columns, paired, reverse);
    groups.style.gridTemplateColumns = layout.map(group => `minmax(0, ${group.width}fr)`).join(' ');
    groups.style.minHeight = `${rows * 45}px`;
    byId('classroom').style.setProperty('--print-font-size', `${Math.min(18, 120 / Math.max(rows, columns))}pt`);
    for (const group of layout) {
      const wrapper = document.createElement('div'); wrapper.className = 'seat-group';
      wrapper.style.setProperty('--row-count', rows);
      wrapper.style.gridTemplateColumns = `repeat(${group.width}, minmax(0, 1fr))`;
      wrapper.style.gridTemplateRows = `repeat(${rows}, minmax(36px, 1fr))`;
      for (const index of group.indices) {
        const cell = document.createElement('div'); cell.className = 'seat';
        wrapper.append(cell); cells.push({ cell, index });
      }
      groups.append(wrapper);
    }
    byId('classroom').setAttribute('aria-label', `${capacity()}석 교실 자리표`);
    byId('seat-summary').textContent = `${columns}열 × ${rows}행 · ${capacity()}석`;
    byId('pairs').setAttribute('aria-disabled', String(!paired || columns % 2 !== 0 || capacity() < 38));
    render();
  }
  function render(highlight = -1) {
    cells.forEach(({cell, index}) => {
      cell.textContent = seats[index];
      cell.classList.toggle('empty', !seats[index]);
      cell.classList.toggle('highlight', Array.isArray(highlight) ? highlight.includes(index) : index === highlight);
      cell.setAttribute('aria-label', `${index + 1}번 자리 ${seats[index] || '비어 있음'}`);
    });
    byId('classroom').classList.toggle('reversed', reverse);
    byId('reverse').setAttribute('aria-pressed', String(reverse));
    byId('reverse').title = reverse ? '칠판에서 학생을 바라보는 방향' : '칠판을 바라보는 방향';
    syncPrint();
  }
  function stop() { run++; clearTimeout(timer); timer = null; revealing = false; silence(); byId('sound-status').textContent = ''; }
  function ready() {
    if (!names.length) return false;
    if (names.length > capacity()) { announce(`학생 ${names.length}명 · 현재 ${capacity()}석. 교실 설정에서 좌석을 늘려 주세요.`, true); return false; }
    return true;
  }
  function installRoster(next, label) {
    stop(); names = next; seats.fill(''); render();
    byId('roster-name').textContent = label; byId('roster-name').title = label;
    byId('roster-count').textContent = `${names.length}명`;
    byId('shuffle').disabled = byId('slow').disabled = false;
    if (ready()) announce(`${names.length}명을 불러왔습니다. ‘자리 바꾸기’를 눌러 주세요.`);
  }
  byId('sample').addEventListener('click', () => { importRun++; installRoster(sampleNames(), '예시 명렬표'); });
  byId('import').addEventListener('click', () => byId('file-object').click());
  byId('file-object').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const ticket = ++importRun;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 명렬표를 선택해 주세요.');
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('xlsx, xls, csv 파일을 선택해 주세요.');
      const bytes = await file.arrayBuffer(); if (ticket !== importRun) return;
      const workbook = window.XLSX.read(bytes, { type: 'array', ...(/\.csv$/i.test(file.name) ? { codepage: 65001 } : {}) });
      if (!workbook.SheetNames.length) throw new Error('시트가 없는 파일입니다.');
      const sheetRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: true });
      installRoster(readNames(sheetRows), file.name);
    } catch (error) { if (ticket === importRun) announce(error.message || '명렬표를 읽지 못했습니다.', true); }
    event.target.value = '';
  });
  byId('shuffle').addEventListener('click', () => { if (!ready()) return; stop(); seats = makePlacement(names, Math.random, capacity()); render(); announce(`${names.length}명의 자리 배치가 완료되었습니다.`); });
  function revealPlacement(target, batches, completedMessage) {
    stop(); const token = run; let index = 0;
    seats.fill(''); render(); revealing = true;
    announce('한 명씩 공개합니다. ‘자리 비우기’를 누르면 멈춥니다.');
    playAudio(backgroundMusic);
    function reveal() {
      if (token !== run) return;
      const batch = batches[index++];
      batch.forEach(seat => { seats[seat] = target[seat]; }); render(batch);
      if (index < batches.length) timer = setTimeout(reveal, 1000);
      else {
        revealing = false; syncPrint(); backgroundMusic.pause(); backgroundMusic.currentTime = 0; playAudio(endingSound);
        timer = setTimeout(() => { if (token === run) render(); }, 1000);
        announce(completedMessage);
      }
    }
    timer = setTimeout(reveal, 1000);
  }
  byId('slow').addEventListener('click', () => {
    if (!ready()) return;
    const target = makePlacement(names, Math.random, capacity());
    const occupied = target.flatMap((name, i) => name ? [i] : []);
    revealPlacement(target, mixed(occupied.length).map(i => [occupied[i]]), `${names.length}명의 자리 배치가 완료되었습니다.`);
  });
  byId('pairs').addEventListener('click', () => {
    if (!paired || columns % 2 !== 0 || capacity() < 38) { announce('멘토·멘티 예시는 짝꿍형·짝수 열·38석 이상에서 사용할 수 있습니다.', true); return; }
    importRun++; installRoster(sampleNames(), '멘토·멘티 예시 명렬표');
    const positions = mixed(capacity() / 2), pairs = mixed(19), target = Array(capacity()).fill(''), batches = [];
    pairs.forEach((pair, i) => {
      const left = positions[i] * 2;
      target[left] = names[pair * 2]; target[left + 1] = names[pair * 2 + 1]; batches.push([left, left + 1]);
    });
    revealPlacement(target, batches, '예시 학생 38명을 멘토·멘티 19쌍으로 배치했습니다.');
    announce('예시 멘토·멘티를 한 쌍씩 공개합니다. ‘자리 비우기’를 누르면 멈춥니다.');
  });
  byId('reverse').addEventListener('click', () => { reverse = !reverse; buildGrid(); });
  byId('clear').addEventListener('click', () => { importRun++; stop(); seats.fill(''); render(); announce(names.length ? '자리를 비웠습니다. 명렬표는 유지됩니다.' : '자리를 비웠습니다. 예시 명렬표 또는 엑셀을 불러오세요.'); });
  function previewCapacity() {
    const nextRows = Number(byId('rows').value), nextColumns = Number(byId('columns').value);
    try { byId('capacity-preview').textContent = `총 ${validateLayout(nextRows, nextColumns)}석`; }
    catch { byId('capacity-preview').textContent = '1~12 사이로 입력'; }
  }
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    const input = byId(button.dataset.for);
    input.value = Math.max(1, Math.min(12, Number(input.value) + Number(button.dataset.step)));
    previewCapacity();
  }));
  ['rows', 'columns'].forEach(id => byId(id).addEventListener('input', previewCapacity));
  byId('layout-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const nextRows = Number(byId('rows').value), nextColumns = Number(byId('columns').value), nextPaired = byId('desk-style').value === 'paired';
      const size = validateLayout(nextRows, nextColumns, names.length);
      if (rows === nextRows && columns === nextColumns && paired === nextPaired) { announce('현재 적용된 배치입니다.'); return; }
      stop(); rows = nextRows; columns = nextColumns; paired = nextPaired; seats = Array(size).fill(''); buildGrid();
      announce(`${columns}열 × ${rows}행, ${size}석으로 변경했습니다.${names.length ? ' 명렬표는 유지됩니다. 자리를 다시 배치해 주세요.' : ''}`);
    } catch (error) { announce(error.message, true); }
  });
  byId('chart-title').addEventListener('input', () => { byId('board-title').textContent = byId('chart-title').value.trim() || '우리 반 자리표'; });
  byId('chart-title').addEventListener('blur', () => { if (!byId('chart-title').value.trim()) byId('chart-title').value = '우리 반 자리표'; });
  byId('chart-title').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
  function syncFullscreen() {
    const active = document.fullscreenElement === workspace || workspace.classList.contains('is-expanded');
    byId('fullscreen').textContent = active ? '전체화면 나가기' : '전체화면';
    byId('fullscreen').setAttribute('aria-pressed', String(active));
    document.body.classList.toggle('expanded', active);
  }
  byId('fullscreen').addEventListener('click', async () => {
    if (document.fullscreenElement === workspace) {
      try { await document.exitFullscreen(); } catch { announce('전체화면을 종료하려면 Esc를 눌러 주세요.'); }
    } else if (workspace.classList.contains('is-expanded')) {
      workspace.classList.remove('is-expanded');
    } else {
      try {
        if (!workspace.requestFullscreen) throw new Error('Fullscreen unavailable');
        await workspace.requestFullscreen();
      } catch { workspace.classList.add('is-expanded'); }
    }
    syncFullscreen();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && workspace.classList.contains('is-expanded')) { workspace.classList.remove('is-expanded'); syncFullscreen(); byId('fullscreen').focus(); }
  });
  byId('sidebar-toggle').addEventListener('click', () => {
    const hidden = !byId('sidebar').hidden;
    byId('sidebar').hidden = hidden;
    byId('app').classList.toggle('sidebar-hidden', hidden);
    byId('sidebar-toggle').textContent = hidden ? '설정 보이기' : '설정 숨기기';
    byId('sidebar-toggle').setAttribute('aria-expanded', String(!hidden));
  });
  const pairsInfo = byId('pairs-info'), helpToggle = byId('pairs-help-toggle');
  function dismissHelp() {
    pairsInfo.classList.remove('open'); pairsInfo.classList.add('dismissed');
    helpToggle.setAttribute('aria-expanded', 'false');
  }
  helpToggle.addEventListener('click', () => {
    if (pairsInfo.classList.contains('open')) dismissHelp();
    else {
      pairsInfo.classList.remove('dismissed'); pairsInfo.classList.add('open');
      helpToggle.setAttribute('aria-expanded', 'true');
    }
  });
  pairsInfo.addEventListener('mouseleave', () => pairsInfo.classList.remove('dismissed'));
  pairsInfo.addEventListener('focusout', event => {
    if (!pairsInfo.contains(event.relatedTarget)) { pairsInfo.classList.remove('open'); pairsInfo.classList.remove('dismissed'); helpToggle.setAttribute('aria-expanded', 'false'); }
  });
  pairsInfo.addEventListener('keydown', event => { if (event.key === 'Escape') dismissHelp(); });
  function syncPrint() {
    byId('print').disabled = revealing || !names.length || seats.filter(Boolean).length !== names.length;
  }
  let titleBeforePrint = null;
  function restorePrintTitle() {
    if (titleBeforePrint !== null) { document.title = titleBeforePrint; titleBeforePrint = null; }
  }
  window.addEventListener('afterprint', restorePrintTitle);
  window.addEventListener('beforeprint', silence);
  byId('print').addEventListener('click', async () => {
    syncPrint(); if (byId('print').disabled) return;
    silence(); render();
    try {
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      if (titleBeforePrint === null) titleBeforePrint = document.title;
      document.title = byId('chart-title').value.trim() || '우리 반 자리표';
      window.print();
    } catch {
      restorePrintTitle();
      announce('인쇄 창을 열지 못했습니다. 브라우저의 인쇄 메뉴를 사용해 주세요.', true);
    }
  });
  buildGrid();
})();
