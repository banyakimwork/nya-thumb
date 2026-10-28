/* 냐썸네일 — 상태·패널·손가락 조작·저장. 그리기는 render.js
   글자는 레이어 여러 개. 레이어마다 글자·색·크기·외곽선·위치(x, y)·기울기를 따로 가진다. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const LS_STATE = 'nyathumb.v2';
const LS_PRESETS = 'nyathumb.presets';
const LS_COLORS = 'nyathumb.colors';

// 냐데이즈 릴스 20장 실측 (PRD §3.4)
const PALETTE = ['#F5F23C', '#3CF028', '#A8F270', '#32F0C2', '#40EAEE', '#D96EF8', '#FA3840', '#F07C48', '#FFFFFF', '#111111'];
const BOX_COLORS = ['#E05AA0', '#111111', '#FFFFFF', '#F5F23C', '#7B5CFF', '#32F0C2'];
const MAX_LAYERS = 6;

// 추가 버튼별 기본값 (실측 §4.4·§4.5)
const KINDS = {
  text:   { text: '문구', color: '#F5F23C', size: 125, stroke: 6 },
  kicker: { text: '머리말', color: '#FFFFFF', size: 70, stroke: 5 },
  box:    { text: '상자 띠 문구', color: '#FFFFFF', size: 68, stroke: 0, box: true },
  tilt:   { text: '기울인 문구', color: '#111111', size: 62, stroke: 4, rot: -15 },
};

function newLayer(kind, over = {}) {
  const k = KINDS[kind];
  return { text: k.text, styles: [], color: k.color, size: k.size, stroke: k.stroke, weight: 'B',
           box: !!k.box, boxColor: '#E05AA0', rot: k.rot || 0, x: W / 2, y: H * ANCHOR.middle, ...over };
}

const fresh = () => ({
  bg: { x: 0, y: 0, z: 1 },
  dim: { on: true, pos: 'bottom', layers: 1, scaleY: 1, opacity: 1, follow: true },
  texts: [newLayer('text', { text: '안 후진 어른', color: '#D96EF8', y: H * ANCHOR.bottom })],
  active: 0,
});

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; }
}
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

// 저장된 상태를 기본값 위에 덮어쓴다 (배경 사진은 저장하지 않음)
const state = fresh();
const saved = load(LS_STATE, null);
if (saved) {
  Object.assign(state.dim, saved.dim);
  if (Array.isArray(saved.texts)) state.texts = saved.texts;
  state.active = Math.min(saved.active || 0, state.texts.length - 1);
}
state.texts.forEach(syncStyles);

const assets = { bg: null, dim: null };
const cv = $('#cv'), ctx = cv.getContext('2d');
const octx = $('#ov').getContext('2d');
let hits = [];
let ready = false;
let tab = 'bg';

const cur = () => state.texts[state.active];

/* ---------- 경로 접근 ("dim.scaleY", "L.size" = 고른 글자) ---------- */
function getP(p) {
  if (p.startsWith('L.')) { const l = cur(); return l ? l[p.slice(2)] : 0; }
  return p.split('.').reduce((o, k) => o[k], state);
}
function setP(p, v) {
  if (p.startsWith('L.')) { const l = cur(); if (l) l[p.slice(2)] = v; return; }
  const ks = p.split('.'), last = ks.pop();
  ks.reduce((o, k) => o[k], state)[last] = v;
  if (p === 'dim.pos') state.dim.follow = false;
}

/* ---------- 그리기 ---------- */
let raf = 0, saveT = 0;
function draw() {
  if (!ready || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    hits = render(ctx, state, assets);
    drawSelection(octx, tab === 'text' ? hits[state.active] : null);
  });
}
function changed() {
  draw();
  syncUI();
  clearTimeout(saveT);
  saveT = setTimeout(() => store(LS_STATE, { dim: state.dim, texts: state.texts, active: state.active }), 300);
}

/* ---------- 미리보기 크기 맞추기 (9:16 유지) ---------- */
function fit() {
  const st = $('#stage');
  const cs = getComputedStyle(st);
  const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let h = ah, w = h * 9 / 16;
  if (w > aw) { w = aw; h = w * 16 / 9; }
  $('#frame').style.width = `${Math.floor(w)}px`;
  $('#frame').style.height = `${Math.floor(h)}px`;
}
new ResizeObserver(fit).observe($('#stage'));

/* ---------- 탭 ---------- */
function showTab(t) {
  if (!$(`.pane[data-pane="${t}"]`)) t = 'bg';
  tab = t;
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === t));
  store('nyathumb.tab', t);
  requestAnimationFrame(fit);
  draw();
}
$('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });

/* ---------- 일반 바인딩: 세그먼트·체크·슬라이더 ---------- */
$$('.seg[data-bind]').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setP(seg.dataset.bind, 'num' in seg.dataset ? Number(b.dataset.v) : b.dataset.v);
    changed();
  });
});
$$('input[type="checkbox"][data-bind]').forEach((el) => {
  el.addEventListener('change', () => { setP(el.dataset.bind, el.checked); changed(); });
});
$$('input[type="range"][data-bind]').forEach((el) => {
  el.addEventListener('input', () => { setP(el.dataset.bind, Number(el.value)); changed(); });
});

const fmt = { 'bg.z': (v) => `${v.toFixed(2)}×`, 'dim.scaleY': (v) => `${v.toFixed(2)}×`,
              'dim.opacity': (v) => `${Math.round(v * 100)}%`,
              'L.size': (v) => `${Math.round(v)}px`, 'L.stroke': (v) => `${v}px`, 'L.rot': (v) => `${Math.round(v)}°` };

function syncUI() {
  $$('.seg[data-bind]').forEach((seg) => {
    const v = getP(seg.dataset.bind);
    $$('button', seg).forEach((b) => b.classList.toggle('on', String(v) === b.dataset.v));
  });
  $$('input[type="checkbox"][data-bind]').forEach((el) => { el.checked = !!getP(el.dataset.bind); });
  $$('input[type="range"][data-bind]').forEach((el) => {
    if (document.activeElement !== el) el.value = getP(el.dataset.bind);
  });
  $$('[data-out]').forEach((el) => { const p = el.dataset.out; el.textContent = (fmt[p] || String)(getP(p)); });
  const l = cur();
  $('#layer-edit').hidden = !l;
  $('#no-layer').hidden = !!l;
  $('#box-field').hidden = !l || !l.box;
  $$('[data-add]').forEach((b) => { b.disabled = state.texts.length >= MAX_LAYERS; });
  renderLayers();
  renderSwatches();
  renderSelection();
}

/* ---------- 레이어 칩 ---------- */
function renderLayers() {
  $('#layers').replaceChildren(...state.texts.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `layer${i === state.active ? ' on' : ''}`;
    b.dataset.i = i;
    const dot = document.createElement('i');
    dot.style.background = t.box ? t.boxColor : t.color;
    b.append(dot, t.text.replace('\n', ' ') || '(빈 글자)');
    return b;
  }));
}
$('#layers').addEventListener('click', (e) => {
  const b = e.target.closest('.layer'); if (!b) return;
  select(Number(b.dataset.i));
});

function select(i) {
  if (state.active === i) return;
  state.active = i;
  sel = null;
  ta.value = cur() ? cur().text : '';
  changed();
}

// 머리말은 고른 글자 바로 위에, 나머지는 화면 가운데에 놓는다
$$('[data-add]').forEach((b) => b.addEventListener('click', () => {
  if (state.texts.length >= MAX_LAYERS) return;
  const kind = b.dataset.add;
  const over = {};
  hits = render(ctx, state, assets);   // 방금 옮긴 위치까지 반영된 자리 정보로
  const h = hits[state.active];
  if (kind === 'kicker' && h) { over.x = h.cx; over.y = h.y - 30; }
  else if (kind === 'tilt') { over.x = W * 0.72; over.y = H * 0.3; }
  state.texts.push(newLayer(kind, over));
  state.active = -1;
  select(state.texts.length - 1);
}));

$('#btn-dup').addEventListener('click', () => {
  const l = cur(); if (!l || state.texts.length >= MAX_LAYERS) return;
  state.texts.push({ ...JSON.parse(JSON.stringify(l)), x: l.x + 40, y: l.y + 60 });
  state.active = -1;
  select(state.texts.length - 1);
});
$('#btn-front').addEventListener('click', () => {
  const l = cur(); if (!l) return;
  state.texts.splice(state.active, 1);
  state.texts.push(l);
  state.active = -1;
  select(state.texts.length - 1);
});
$('#btn-del').addEventListener('click', () => {
  if (!cur()) return;
  state.texts.splice(state.active, 1);
  const next = Math.max(0, state.active - 1);
  state.active = -1;
  if (state.texts.length) select(next);
  else { state.active = 0; ta.value = ''; changed(); }
});

// 위치 바로가기: 세로는 실측 위치로, 딤은 따라가기가 켜져 있으면 같이
$('#snap').addEventListener('click', (e) => {
  const b = e.target.closest('button'); const l = cur(); if (!b || !l) return;
  const v = b.dataset.v;
  if (v === 'center') { l.x = W / 2; changed(); return; }
  l.y = H * ANCHOR[v];
  l.x = W / 2;
  if (state.dim.follow) {
    if (v === 'middle') state.dim.on = false;
    else { state.dim.on = true; state.dim.pos = v; }
  }
  changed();
});

/* ---------- 글자 입력 + 글자별 스타일 ---------- */
const ta = $('#main-text');
ta.value = cur() ? cur().text : '';

function syncStyles(l) {
  const n = Array.from(l.text).length;
  const st = l.styles || [];
  l.styles = Array.from({ length: n }, (_, i) => st[i] || {});
}

// 최대 2줄. 바뀐 구간만 찾아 글자별 스타일을 밀고 당긴다 (앞 글자 스타일을 이어받음)
ta.addEventListener('input', () => {
  const l = cur(); if (!l) return;
  let v = ta.value;
  const ls = v.split('\n');
  if (ls.length > 2) { v = `${ls[0]}\n${ls.slice(1).join(' ')}`; ta.value = v; }
  const a = Array.from(l.text), b = Array.from(v);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const inherit = { ...(l.styles[p - 1] || {}) };
  const ins = Array.from({ length: b.length - p - q }, () => ({ ...inherit }));
  l.styles = [...l.styles.slice(0, p), ...ins, ...l.styles.slice(a.length - q)];
  l.text = v;
  sel = null;
  changed();
});

// 선택 구간 (글자 단위). 색 칩을 누르면 텍스트칸이 포커스를 잃어도 기억해 둔다
let sel = null;
const cp = (u16) => Array.from(ta.value.slice(0, u16)).length;
document.addEventListener('selectionchange', () => {
  if (document.activeElement !== ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  sel = s !== e ? [cp(s), cp(e)] : null;
  renderSelection();
  renderSwatches();
});
$('#sel-clear').addEventListener('click', () => { sel = null; ta.setSelectionRange(0, 0); ta.blur(); changed(); });

function renderSelection() {
  const l = cur();
  if (!l) sel = null;
  $('#sel-chip').hidden = !sel;
  $('#color-scope').textContent = sel ? '선택한 글자만' : '전체';
  $$('#sel-scale button').forEach((b) => { b.disabled = !sel; b.classList.remove('on'); });
  if (sel) {
    $('#sel-text').textContent = `"${Array.from(l.text).slice(sel[0], sel[1]).join('').replace('\n', ' ')}"`;
    const s0 = l.styles[sel[0]] || {};
    $$('#sel-scale button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === (s0.s || 1)));
  }
}

function applyToSel(fn) {
  const l = cur();
  for (let i = sel[0]; i < sel[1]; i++) l.styles[i] = fn({ ...l.styles[i] });
}

$('#sel-scale').addEventListener('pointerdown', (e) => e.preventDefault());
$('#sel-scale').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !sel) return;
  const s = Number(b.dataset.v);
  applyToSel((st) => { if (s === 1) delete st.s; else st.s = s; return st; });
  changed();
});

/* ---------- 색 칩 ---------- */
const myColors = () => load(LS_COLORS, []);

function swatch(c, on, mine) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sw${on ? ' on' : ''}${mine ? ' mine' : ''}`;
  b.style.background = c;
  b.dataset.c = c;
  b.setAttribute('aria-label', c);
  return b;
}

function renderSwatches() {
  const l = cur(); if (!l) return;
  const all = [...PALETTE, ...myColors()];
  const now = sel ? (l.styles[sel[0]] || {}).c || l.color : l.color;
  $('#main-swatches').replaceChildren(...all.map((c, i) => swatch(c, c.toUpperCase() === now.toUpperCase(), i >= PALETTE.length)));
  $('#box-swatches').replaceChildren(...BOX_COLORS.map((c) => swatch(c, c === l.boxColor)));
}

$('#main-swatches').addEventListener('pointerdown', (e) => e.preventDefault());   // 텍스트 선택 유지
$('#main-swatches').addEventListener('click', (e) => {
  const b = e.target.closest('.sw'); const l = cur(); if (!b || !l) return;
  const c = b.dataset.c;
  if (sel) applyToSel((st) => { if (c === l.color) delete st.c; else st.c = c; return st; });
  else { l.color = c; l.styles.forEach((st) => delete st.c); }
  changed();
});
$('#box-swatches').addEventListener('click', (e) => {
  const b = e.target.closest('.sw'); const l = cur(); if (!b || !l) return;
  l.boxColor = b.dataset.c; changed();
});

$('#btn-mycolor').addEventListener('click', () => {
  const c = $('#mycolor').value.toUpperCase();
  const list = myColors().filter((x) => x !== c);
  list.push(c);
  store(LS_COLORS, list.slice(-4));
  changed();
});

/* ---------- 배경 사진 ---------- */
$('#file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    if (assets.bg) URL.revokeObjectURL(assets.bg.src);
    assets.bg = img;
    state.bg = { x: 0, y: 0, z: 1 };
    changed();
  };
  img.src = URL.createObjectURL(f);
  e.target.value = '';
});
$('#btn-fit').addEventListener('click', () => { state.bg = { x: 0, y: 0, z: 1 }; changed(); });

/* ---------- 미리보기에서 손가락 조작 ----------
   글자 위에서 시작: 한 손가락 = 이동, 두 손가락 = 크기·기울기
   빈 곳에서 시작:   한 손가락 = 사진 이동, 두 손가락 = 사진 확대 */
const ptrs = new Map();
let drag = null, pinch = null;

function toCanvas(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// [배경] 탭에서는 글자를 못 집는다 — 글자가 사진을 덮고 있어도 사진만 움직이게
const grab = (p) => (tab === 'bg' ? null : hitTest(hits, p));

function startDrag(p) {
  const h = grab(p);
  if (h) {
    select(h.idx);
    const l = cur();
    drag = { kind: 'text', start: p, orig: { x: l.x, y: l.y } };
  } else {
    drag = { kind: 'bg', start: p, orig: { ...state.bg } };
  }
}

cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = toCanvas(e);
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) startDrag(p);
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const l = cur();
    const onText = drag && drag.kind === 'text' && l;
    pinch = { d0: dist(a, b), a0: angle(a, b), onText, z0: state.bg.z,
              s0: onText ? l.size : 0, r0: onText ? l.rot : 0 };
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const p = toCanvas(e);
  ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const k = dist(a, b) / pinch.d0;
    if (pinch.onText) {
      const l = cur();
      l.size = Math.round(clamp(pinch.s0 * k, 30, 300));
      let r = pinch.r0 + (angle(a, b) - pinch.a0);
      r = ((r + 180) % 360 + 360) % 360 - 180;
      l.rot = Math.abs(r) < 3 ? 0 : Math.round(clamp(r, -45, 45));   // 0° 근처는 똑바로 붙여줌
    } else {
      state.bg.z = clamp(pinch.z0 * k, 0.3, 4);
    }
    draw();
    return;
  }
  if (!drag) return;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (drag.kind === 'bg') { state.bg.x = drag.orig.x + dx; state.bg.y = drag.orig.y + dy; }
  else {
    const l = cur();
    const x = drag.orig.x + dx;
    l.x = Math.abs(x - W / 2) < 18 ? W / 2 : x;   // 가로 가운데 근처면 붙여줌
    l.y = drag.orig.y + dy;
  }
  draw();
});
function endPtr(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) { drag = null; changed(); }
  else if (ptrs.size === 1) startDrag([...ptrs.values()][0]);   // 남은 손가락으로 이어서 끌기
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
// 맥: 글자 위에서 휠 = 글자 크기, 빈 곳에서 휠 = 사진 확대
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const h = grab(toCanvas(e));
  const k = Math.exp(-e.deltaY * 0.0015);
  if (h) { select(h.idx); cur().size = Math.round(clamp(cur().size * k, 30, 300)); }
  else state.bg.z = clamp(state.bg.z * k, 0.3, 4);
  changed();
}, { passive: false });

/* ---------- 피드 가이드 · 초기화 ---------- */
$('#btn-guide').addEventListener('click', (e) => {
  const on = $('#guide').hidden;
  $('#guide').hidden = !on;
  e.currentTarget.setAttribute('aria-pressed', String(on));
});
// 초기화는 두 가지: 완전히 처음 상태로 / 딤·첫 글자 스타일은 남기고 사진·글자 내용만 비우기.
// 내 스타일·내 색은 어느 쪽이든 지우지 않는다
$('#btn-reset').addEventListener('click', () => { $('#reset-sheet').hidden = false; });
$('#reset-sheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-reset]');
  if (!b && e.target !== e.currentTarget) return;
  $('#reset-sheet').hidden = true;
  const how = b ? b.dataset.reset : 'cancel';
  if (how === 'cancel') return;
  assets.bg = null;
  if (how === 'all') {
    Object.assign(state, fresh());
  } else {
    state.bg = { x: 0, y: 0, z: 1 };
    const first = state.texts[0];
    state.texts = first ? [{ ...first, text: '', styles: [] }] : [newLayer('text', { y: H * ANCHOR.bottom })];
    state.active = 0;
  }
  ta.value = cur() ? cur().text : '';
  sel = null;
  changed();
  showTab('bg');
});

/* ---------- 내 스타일 ---------- */
const STYLE_KEYS = ['color', 'size', 'stroke', 'weight', 'box', 'boxColor', 'rot', 'x', 'y'];
function renderPresets() {
  const list = load(LS_PRESETS, []);
  $('#presets').replaceChildren(...list.map((p, i) => {
    const el = document.createElement('span');
    el.className = 'preset';
    el.innerHTML = `<button type="button" data-apply="${i}"></button><button type="button" data-rm="${i}" aria-label="지우기">✕</button>`;
    el.firstChild.textContent = p.name;
    return el;
  }));
}
$('#btn-preset-save').addEventListener('click', () => {
  const l = cur(); if (!l) return;
  const where = l.y < H / 3 ? '상단' : l.y > H * 2 / 3 ? '하단' : '중간';
  const name = $('#preset-name').value.trim() ||
    `${where} · 딤${state.dim.on ? `${state.dim.layers}겹×${state.dim.scaleY}` : '없음'}`;
  const style = {};
  STYLE_KEYS.forEach((k) => { style[k] = l[k]; });
  const list = load(LS_PRESETS, []);
  list.push({ name, dim: { ...state.dim }, style });
  store(LS_PRESETS, list);
  $('#preset-name').value = '';
  renderPresets();
});
$('#presets').addEventListener('click', (e) => {
  const list = load(LS_PRESETS, []);
  const a = e.target.closest('[data-apply]'), r = e.target.closest('[data-rm]');
  if (a) {
    const p = list[a.dataset.apply];
    Object.assign(state.dim, p.dim);
    const l = cur();
    if (l && p.style) { Object.assign(l, p.style); l.styles.forEach((st) => delete st.c); }
    changed();
  } else if (r) {
    list.splice(r.dataset.rm, 1);
    store(LS_PRESETS, list);
    renderPresets();
  }
});

/* ---------- PNG 저장 ---------- */
$('#btn-export').addEventListener('click', async () => {
  hits = render(ctx, state, assets);   // 대기 중인 그리기가 있어도 지금 상태로 확정 (선택 테두리는 별도 캔버스라 안 들어감)
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `nyadays-thumb-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === 'AbortError') return; }   // 사용자가 닫은 건 그냥 끝
  }
  // 공유 시트가 안 되면: 이미지를 띄워 길게 눌러 저장 + 파일 받기
  const url = URL.createObjectURL(blob);
  $('#out-img').src = url;
  $('#out-dl').href = url;
  $('#out-dl').download = name;
  $('#out').hidden = false;
});
$('#out-close').addEventListener('click', () => {
  $('#out').hidden = true;
  URL.revokeObjectURL($('#out-img').src);
});

/* ---------- 시작 ---------- */
(async function boot() {
  const dim = new Image();
  const dimReady = new Promise((r) => { dim.onload = r; dim.onerror = r; });
  dim.src = 'assets/dim.png';
  // 글꼴이 오기 전에 그리면 엉뚱한 기본 글꼴로 저장될 수 있다 (PRD §7)
  await Promise.all([document.fonts.load('100px NyjoaB'), document.fonts.load('100px NyjoaR'), dimReady]);
  assets.dim = dim;
  ready = true;
  $('#loading').hidden = true;
  showTab(load('nyathumb.tab', 'bg'));
  renderPresets();
  fit();
  changed();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
