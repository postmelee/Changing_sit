const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const XLSX = require('../docs/vendor/xlsx.full.min.js');

// Exercise real event handlers with a deterministic clock and a minimal DOM.
function workspace() {
  class Element {
    constructor() {
      this.value = ''; this.textContent = ''; this.style = {}; this.children = [];
      this.attributes = {}; this.listeners = {}; this.disabled = false; this.paused = true; this.plays = 0; this.currentTime = 0;
      const classes = new Set();
      this.classList = {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name)};
    }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
    focus() {}
    blur() {}
    async fire(type, extra = {}) { return this.listeners[type]?.({target:this,preventDefault(){},...extra}); }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('rows').value = '5'; get('columns').value = '8'; get('desk-style').value = 'paired';
  const document = {getElementById:get,createElement:() => new Element(),querySelectorAll:() => [],body:new Element(),listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const timers = new Map(); let nextTimer = 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../docs/app.js'), 'utf8'), {document, window:{XLSX},setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout(id){timers.delete(id);}});
  const click = id => get(id).fire('click');
  const tick = () => { const pending = [...timers.values()];timers.clear();pending.forEach(fn=>fn()); };
  const cells = () => get('groups').children.flatMap(group => group.children);
  const occupied = () => cells().filter(cell=>!cell.classList.contains('empty'));
  return {get,click,tick,cells,occupied,document};
}

test('layout changes cancel slow reveal while keeping the roster', async () => {
  const w = workspace(); await w.click('sample'); await w.click('slow'); w.tick();
  assert.equal(w.occupied().length,1);
  w.get('rows').value = '6'; await w.get('layout-form').fire('submit'); w.tick();
  assert.equal(w.cells().length,48); assert.equal(w.occupied().length,0);
  await w.click('shuffle'); assert.equal(w.occupied().length,38);
});
test('failed shrink preserves a completed arrangement; clearing stops future reveals', async () => {
  const w = workspace(); await w.click('sample'); await w.click('shuffle');
  const before = w.cells().map(c=>c.textContent);
  w.get('columns').value = '7'; await w.get('layout-form').fire('submit');
  assert.deepEqual(w.cells().map(c=>c.textContent),before);
  assert.match(w.get('status').textContent,/38석 이상/);
  await w.click('slow'); w.tick(); await w.click('clear'); w.tick();
  assert.equal(w.occupied().length,0);
});
test('slow reveal completes all occupied seats on a larger grid after changing viewpoint', async () => {
  const w = workspace(); await w.click('sample'); w.get('columns').value = '11'; w.get('rows').value = '7';
  await w.get('layout-form').fire('submit'); await w.click('slow');
  for(let i=0;i<10;i++) w.tick(); await w.click('reverse');
  for(let i=0;i<30;i++) w.tick();
  assert.equal(w.occupied().length,38);
  assert.equal(new Set(w.occupied().map(c=>c.textContent)).size,38);
  assert.equal(w.cells().length,77);
});
test('roster import over current capacity keeps all names and becomes usable after expansion', async () => {
  const w = workspace();
  const csv = '이름\n' + Array.from({length:60},(_,i)=>`학생${i}`).join('\n');
  w.get('file-object').files = [{name:'sixty.csv',size:1000,arrayBuffer:async()=>new TextEncoder().encode(csv)}];
  await w.get('file-object').fire('change'); await w.click('shuffle');
  assert.match(w.get('status').textContent,/현재 40석/); assert.equal(w.occupied().length,0);
  w.get('columns').value = '10'; w.get('rows').value = '6'; await w.get('layout-form').fire('submit'); await w.click('shuffle');
  assert.equal(w.occupied().length,60);
});
test('fullscreen fallback toggles and Esc restores the workspace', async () => {
  const w = workspace(); await w.click('fullscreen');
  assert.equal(w.get('workspace').classList.contains('is-expanded'),true);
  assert.equal(w.get('fullscreen').attributes['aria-pressed'],'true');
  w.document.listeners.keydown({key:'Escape'});
  assert.equal(w.get('workspace').classList.contains('is-expanded'),false);
  await w.click('fullscreen'); await w.click('fullscreen');
  assert.equal(w.document.body.classList.contains('expanded'),false);
});
test('mentor example updates the roster and keeps pairs adjacent in a larger classroom', async () => {
  const w = workspace(); w.get('columns').value = '10'; await w.get('layout-form').fire('submit'); await w.click('pairs'); for(let i=0;i<19;i++) w.tick();
  assert.equal(w.get('roster-count').textContent,'38명'); assert.equal(w.occupied().length,38);
  const assigned = new Map(w.cells().map(c => [Number(c.attributes['aria-label'].split('번')[0]), c.textContent]));
  for(let seat=1;seat<=50;seat+=2) {
    if (!assigned.get(seat).startsWith('학생')) continue;
    assert.equal(Number(assigned.get(seat+1).slice(2)),Number(assigned.get(seat).slice(2))+1);
  }
});
test('slow reveal plays original music, then ending sound, and reset silences both', async () => {
  const w = workspace(); await w.click('sample'); await w.click('slow');
  assert.equal(w.get('background-music').paused,false);
  assert.equal(w.get('ending-sound').plays,0);
  for(let i=0;i<38;i++) w.tick();
  assert.equal(w.get('background-music').paused,true);
  assert.equal(w.get('ending-sound').plays,1);
  await w.click('clear');
  assert.equal(w.get('ending-sound').paused,true);
  assert.equal(w.get('ending-sound').currentTime,0);
});
test('muting silences current music and prevents the completion sound', async () => {
  const w = workspace(); await w.click('sample'); await w.click('slow'); await w.click('sound');
  assert.equal(w.get('background-music').paused,true);
  for(let i=0;i<38;i++) w.tick();
  assert.equal(w.get('ending-sound').plays,0);
  await w.click('slow'); assert.equal(w.get('background-music').paused,true);
  await w.click('sound'); assert.equal(w.get('background-music').paused,false);
  w.get('rows').value='6'; await w.get('layout-form').fire('submit');
  assert.equal(w.get('background-music').paused,true);
});
test('audio playback failure does not interrupt seat reveal', async () => {
  const w = workspace(); await w.click('sample');
  w.get('background-music').play = () => Promise.reject(new Error('media blocked'));
  await w.click('slow');
  assert.match(w.get('sound-status').textContent,/자리 배치는 계속/);
  for(let i=0;i<38;i++) w.tick();
  assert.equal(w.occupied().length,38);
});
