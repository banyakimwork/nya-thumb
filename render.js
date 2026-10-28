/* 캔버스 그리기 — 배경 → 딤 → 메인 문구 → 꾸밈 자막 순서 (PRD §6)
   모든 좌표·크기는 1080×1920 기준. 미리보기와 저장본이 같은 캔버스를 쓴다. */

const W = 1080, H = 1920;
const ANCHOR = { top: 0.16, middle: 0.5, bottom: 0.78 };   // 위치 바로가기의 세로 중심 (실측 §4.4)
const MAX_W = 0.96 * W;                                    // 화면 밖으로 넘칠 때만 자동 축소

function fontStr(px, weight) {
  return `${Math.round(px)}px ${weight === 'R' ? 'NyjoaR' : 'NyjoaB'}`;
}

// 글자색이 어두우면 외곽선을 흰색으로 — 검정 글씨에 검정 외곽선은 안 보인다
function strokeFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l < 0.3 ? '#FFFFFF' : '#000000';
}

/* 글자 배열 + 글자별 스타일 → 줄·구간(run) 배치.
   같은 색·같은 배율이 이어지면 한 구간으로 묶어 한 번에 그린다. */
function layout(ctx, text, styles, o) {
  const chars = Array.from(text);
  const raw = [];
  let line = { runs: [], w: 0, maxPx: 0 };
  chars.forEach((ch, i) => {
    if (ch === '\n') { raw.push(line); line = { runs: [], w: 0, maxPx: 0 }; return; }
    const st = (styles && styles[i]) || {};
    const px = o.size * (st.s || 1);
    const color = st.c || null;
    const last = line.runs[line.runs.length - 1];
    if (last && last.px === px && last.color === color) last.text += ch;
    else line.runs.push({ text: ch, px, color });
  });
  raw.push(line);
  const lines = raw.filter((l) => l.runs.length);
  let widest = 0;
  for (const l of lines) {
    l.w = 0; l.maxPx = 0;
    for (const r of l.runs) {
      ctx.font = fontStr(r.px, o.weight);
      r.w = ctx.measureText(r.text).width;
      l.w += r.w; l.maxPx = Math.max(l.maxPx, r.px);
    }
    widest = Math.max(widest, l.w);
  }
  const k = o.maxW && widest > o.maxW ? o.maxW / widest : 1;
  if (k < 1) for (const l of lines) {
    l.w *= k; l.maxPx *= k;
    for (const r of l.runs) { r.w *= k; r.px *= k; }
  }
  const gap = o.lineGap || 1.08;
  let h = 0;
  for (const l of lines) { l.h = l.maxPx * gap; h += l.h; }
  return { lines, w: lines.reduce((m, l) => Math.max(m, l.w), 0), h };
}

/* 배치된 줄을 (cx, top)부터 그린다. 외곽선을 줄 전체에 먼저 깔고 채우기를 얹어야
   옆 글자의 외곽선이 앞 글자를 덮지 않는다. */
function drawBlock(ctx, L, cx, top, o) {
  let y = top;
  for (const l of L.lines) {
    const base = y + (l.h - l.maxPx) / 2 + l.maxPx * 0.86;   // 큰 글자·작은 글자를 바닥선에 맞춤
    const x0 = cx - l.w / 2;
    if (o.box) {
      const padX = l.maxPx * 0.22, padY = l.maxPx * 0.06;
      ctx.fillStyle = o.boxColor;
      ctx.fillRect(x0 - padX, y + padY, l.w + padX * 2, l.h - padY);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    if (o.stroke > 0 && !o.box) {
      let x = x0;
      for (const r of l.runs) {
        ctx.font = fontStr(r.px, o.weight);
        ctx.lineWidth = o.stroke * 2;
        ctx.strokeStyle = strokeFor(r.color || o.color);
        ctx.strokeText(r.text, x, base);
        x += r.w;
      }
    }
    let x = x0;
    for (const r of l.runs) {
      ctx.font = fontStr(r.px, o.weight);
      ctx.fillStyle = r.color || o.color;
      ctx.fillText(r.text, x, base);
      x += r.w;
    }
    y += l.h;
  }
}

function drawPlaceholder(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d9d4cc');
  g.addColorStop(1, '#a9a197');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.font = '64px NyjoaR';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('[배경] 탭에서 사진을 골라주세요', W / 2, H * 0.44);
}

function drawBg(ctx, img, t) {
  const base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const s = base * t.z;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (W - dw) / 2 + t.x, (H - dh) / 2 + t.y, dw, dh);
}

// 딤 원본은 하단용(위 투명 → 아래 진함). 상단이면 상하 반전. 가로는 1080에 맞추고 세로만 늘린다 (PRD §4.2)
function drawDim(ctx, dim, d) {
  if (!d.on || !dim) return;
  const h = W * dim.naturalHeight / dim.naturalWidth * d.scaleY;
  for (let i = 0; i < d.layers; i++) {
    ctx.save();
    ctx.globalAlpha = d.opacity == null ? 1 : d.opacity;
    if (d.pos === 'top') {
      ctx.translate(0, h);
      ctx.scale(1, -1);
      ctx.drawImage(dim, 0, 0, W, h);
    } else {
      ctx.drawImage(dim, 0, H - h, W, h);
    }
    ctx.restore();
  }
}

/* 전체 그리기. 글자 레이어는 각자 위치(x, y = 덩어리 중심)·크기·기울기를 가진다.
   반환값 = 손가락으로 집을 수 있는 영역 목록 (레이어 순서와 같음) */
function render(ctx, s, assets) {
  const hits = [];
  ctx.clearRect(0, 0, W, H);
  if (assets.bg) drawBg(ctx, assets.bg, s.bg); else drawPlaceholder(ctx);
  drawDim(ctx, assets.dim, s.dim);

  s.texts.forEach((t, idx) => {
    const o = { size: t.size, weight: t.weight, maxW: MAX_W, lineGap: 1.08, color: t.color,
                stroke: t.box ? 0 : t.stroke, box: t.box, boxColor: t.boxColor };
    const L = layout(ctx, t.text, t.styles, o);
    if (!L.lines.length) { hits.push(null); return; }
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate((t.rot || 0) * Math.PI / 180);
    drawBlock(ctx, L, 0, -L.h / 2, o);
    ctx.restore();
    const pad = Math.max(24, t.size * 0.2);
    hits.push({ idx, x: t.x - L.w / 2 - pad, y: t.y - L.h / 2 - pad / 2, w: L.w + pad * 2, h: L.h + pad,
                cx: t.x, cy: t.y, rot: t.rot || 0 });
  });
  return hits;
}

// 고른 글자 표시 (저장본에는 안 들어가는 별도 캔버스에 그림)
function drawSelection(octx, h) {
  octx.clearRect(0, 0, W, H);
  if (!h) return;
  octx.save();
  octx.translate(h.cx, h.cy);
  octx.rotate(h.rot * Math.PI / 180);
  octx.translate(-h.cx, -h.cy);
  octx.lineWidth = 5;
  octx.setLineDash([18, 12]);
  octx.strokeStyle = 'rgba(0,0,0,.55)';
  octx.strokeRect(h.x, h.y + 3, h.w, h.h);
  octx.strokeStyle = '#FFD700';
  octx.strokeRect(h.x, h.y, h.w, h.h);
  octx.restore();
}

// 회전된 상자까지 고려한 집기 판정. 위에 그려진 것(나중 것)부터 본다
function hitTest(hits, p) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (!h) continue;
    const a = -h.rot * Math.PI / 180;
    const dx = p.x - h.cx, dy = p.y - h.cy;
    const x = h.cx + dx * Math.cos(a) - dy * Math.sin(a);
    const y = h.cy + dx * Math.sin(a) + dy * Math.cos(a);
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}
