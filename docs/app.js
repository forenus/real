// 프론트엔드 — 서버 API와 통신해 평형별 매매 매물 증감을 표시
const $ = (id) => document.getElementById(id);

// 읽기 전용 정적 모드(GitHub Pages) — 서버 API 대신 data.json 에서 같은 응답을 꺼낸다.
const STATIC = !!window.STATIC_MODE;
let staticData = null;
async function api(path, opts) {
  if (STATIC) {
    if (!staticData) staticData = await (await fetch("data.json", { cache: "no-store" })).json();
    if (path.startsWith("/api/state")) return staticData.state;
    if (path.startsWith("/api/news?topic=dongtan")) return staticData.newsDongtan || { items: [] };
    if (path.startsWith("/api/news")) return staticData.news || { items: [] };
    if (path.startsWith("/api/changes")) {
      const py = decodeURIComponent((path.match(/pyeong=([^&]+)/) || [])[1] || "");
      return staticData.changes[py] || { available: false, reason: "no-data" };
    }
    throw new Error("읽기 전용 페이지입니다.");
  }
  const res = await fetch(path, opts);
  return res.json();
}

function setStatus(msg, kind = "info") {
  const el = $("status");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "status " + kind;
  el.textContent = msg;
}

function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 전일/오늘 건수 셀 — 0건이 아니면 눌러서 그 날짜의 매물 목록을 볼 수 있다
function cntCell(r, which) {
  const n = which === "prev" ? r.prev : r.today;
  if (!n) return "–";
  return `<button class="cnt-btn" data-pyeong="${r.pyeong}" data-label="${esc(r.label)}" data-which="${which}" title="${which === "prev" ? "전일" : "오늘"} ${r.pyeong}평 매물 목록 보기">${n}</button>`;
}

function fmtDelta(diff) {
  if (diff > 0) return { cls: "up", txt: `▲ ${diff}` };
  if (diff < 0) return { cls: "down", txt: `▼ ${Math.abs(diff)}` };
  return { cls: "same", txt: "–" };
}

// 카테고리 팔레트 — 흰 카드 배경(#ffffff) 기준. 4번째(호박색)는 흰 배경 대비 3:1 을 넘기도록 어둡게 조정.
// 두 차트가 같은 배열을 쓴다 — 색이 순위가 아니라 평형(개체)을 따라가야 하므로 25평은 두 그래프에서 같은 색.
const COLORS = ["#3987e5", "#d95926", "#199e70", "#a86f00", "#d55181", "#008300"];
// 차트 보조 색 — 밝은 본문 테마(격자·축 글자·점 테두리·직접 라벨·크로스헤어)
const INK = { grid: "#e5e8ee", axis: "#6b7686", ring: "#ffffff", label: "#1a1f29", hair: "#9aa3b2" };

// SVG 라인 차트 — 평형별 매물 추이. 추정 구간은 점선.
function renderChart(chart) {
  const wrap = $("chart-wrap");
  const note = $("chart-note");
  const legend = $("chart-legend");
  if (!chart || !chart.dates || chart.dates.length === 0) {
    wrap.innerHTML = `<p class="empty">데이터가 쌓이면 그래프가 표시됩니다.</p>`;
    note.textContent = ""; legend.textContent = "";
    return;
  }

  const dates = chart.dates;
  const series = chart.series;
  const estSet = new Set(chart.estimatedDates || []);
  // 실거래 가격추이와 같은 틀(여백·선 굵기·끝 라벨·툴팁)로 그린다
  const W = 760, H = 300, pad = { l: 44, r: 50, t: 16, b: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

  let maxY = 0;
  for (const s of series) for (const v of s.data) if (v > maxY) maxY = v;
  const STEP = maxY > 50 ? 20 : maxY > 20 ? 10 : 5; // 눈금은 보기 좋은 단위로
  maxY = Math.max(STEP, Math.ceil(maxY / STEP) * STEP);
  const ticks = maxY / STEP;

  const x = (i) => pad.l + (dates.length === 1 ? iw / 2 : (iw * i) / (dates.length - 1));
  const y = (v) => pad.t + ih - (ih * v) / maxY;

  const NS = "http://www.w3.org/2000/svg";
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const txt = (a, s) => { const t = el("text", a); t.textContent = s; return t; };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", preserveAspectRatio: "xMidYMid meet", role: "img" });

  // y 격자 + 눈금 (개)
  for (let g = 0; g <= ticks; g++) {
    const v = maxY - STEP * g;
    const yy = y(v);
    svg.appendChild(el("line", { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, stroke: INK.grid, "stroke-width": 1 }));
    svg.appendChild(txt({ x: pad.l - 8, y: yy + 4, fill: INK.axis, "font-size": 11, "text-anchor": "end" }, v + "개"));
  }

  // x 라벨 (최대 8개)
  const step = Math.ceil(dates.length / 8);
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    svg.appendChild(txt({ x: x(i), y: H - pad.b + 18, fill: INK.axis, "font-size": 10, "text-anchor": "middle" }, d.slice(5)));
  });

  // 추정/실제 경계 (첫 실제 날짜에 세로 점선 + 표시)
  const firstReal = dates.findIndex((d) => !estSet.has(d));
  if (firstReal > 0) {
    svg.appendChild(el("line", { x1: x(firstReal), y1: pad.t, x2: x(firstReal), y2: pad.t + ih, stroke: INK.hair, "stroke-width": 1, "stroke-dasharray": "3 3" }));
    svg.appendChild(txt({ x: x(firstReal) + 5, y: pad.t + 11, fill: INK.axis, "font-size": 10 }, "실제 수집 →"));
  }

  // 평형별: 추정 구간(점선)과 실제 구간(실선)을 각각 한 줄로 + 마지막 점 + 끝 라벨
  series.forEach((s, si) => {
    const color = COLORS[si % COLORS.length];
    const pts = (from, to) => { const a = []; for (let i = from; i <= to; i++) a.push(`${x(i)},${y(s.data[i])}`); return a.join(" "); };
    const line = (from, to, dash) => {
      if (to <= from) return;
      svg.appendChild(el("polyline", {
        points: pts(from, to), fill: "none", stroke: color, "stroke-width": 2,
        "stroke-linecap": "round", "stroke-linejoin": "round", ...(dash ? { "stroke-dasharray": "4 4" } : {}),
      }));
    };
    const last = dates.length - 1;
    // 선 아래 옅은 그라데이션 면 — 위에서 아래로 사라지게
    const gid = `cg-${si}`;
    const defs = svg.querySelector("defs") || svg.insertBefore(el("defs", {}), svg.firstChild);
    const lg = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(el("stop", { offset: "0%", "stop-color": color, "stop-opacity": 0.12 }));
    lg.appendChild(el("stop", { offset: "100%", "stop-color": color, "stop-opacity": 0 }));
    defs.appendChild(lg);
    svg.appendChild(el("polygon", {
      points: `${x(0)},${pad.t + ih} ${pts(0, last)} ${x(last)},${pad.t + ih}`, fill: `url(#${gid})`,
    }));
    if (firstReal > 0) { line(0, firstReal, true); line(firstReal, last, false); }
    else line(0, last, firstReal < 0);

    svg.appendChild(el("circle", { cx: x(last), cy: y(s.data[last]), r: 4, fill: color, stroke: INK.ring, "stroke-width": 2 }));
    const ly = Math.min(pad.t + ih - 2, Math.max(pad.t + 10, y(s.data[last])));
    svg.appendChild(txt({ x: x(last) + 9, y: ly + 4, fill: INK.label, "font-size": 11, "font-weight": 700 }, `${s.pyeong}평`));
  });

  // 크로스헤어 + 마우스가 가리키는 날의 점 + 툴팁
  const hair = el("line", { y1: pad.t, y2: pad.t + ih, stroke: INK.hair, "stroke-width": 1, visibility: "hidden" });
  svg.appendChild(hair);
  const marks = series.map((s, si) => {
    const m = el("circle", { r: 4, fill: COLORS[si % COLORS.length], stroke: INK.ring, "stroke-width": 2, visibility: "hidden" });
    svg.appendChild(m);
    return m;
  });
  svg.appendChild(el("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" }));

  wrap.innerHTML = "";
  wrap.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  let cur = -1;
  function showAt(i) {
    if (i < 0 || i >= dates.length) return;
    cur = i;
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i));
    hair.setAttribute("visibility", "visible");
    marks.forEach((m, si) => {
      m.setAttribute("cx", x(i)); m.setAttribute("cy", y(series[si].data[i]));
      m.setAttribute("visibility", "visible");
    });

    tip.textContent = "";
    const head = document.createElement("div");
    head.className = "viz-tip-date";
    head.textContent = dates[i] + (estSet.has(dates[i]) ? " (추정)" : "");
    tip.appendChild(head);
    series.forEach((s, si) => {
      const row = document.createElement("div");
      row.className = "viz-tip-row";
      const key = document.createElement("i");
      key.style.background = COLORS[si % COLORS.length];
      const val = document.createElement("b");
      val.textContent = `${s.data[i]}개`;
      const nm = document.createElement("span");
      const diff = i > 0 ? s.data[i] - s.data[i - 1] : 0;
      nm.textContent = `${s.pyeong}평` + (i > 0 ? (diff ? ` · ${diff > 0 ? "▲" : "▼"}${Math.abs(diff)}` : " · 변동 없음") : "");
      row.append(key, val, nm);
      tip.appendChild(row);
    });
    tip.hidden = false;

    // SVG 좌표 → 화면 좌표 (뷰박스가 반응형이라 배율 보정)
    const rect = wrap.getBoundingClientRect();
    const scale = rect.width / W;
    const left = x(i) * scale;
    tip.style.left = Math.max(4, Math.min(rect.width - tip.offsetWidth - 4, left - tip.offsetWidth / 2)) + "px";
    tip.style.top = Math.max(2, pad.t * scale) + "px";
  }
  function hide() {
    tip.hidden = true; hair.setAttribute("visibility", "hidden");
    marks.forEach((m) => m.setAttribute("visibility", "hidden"));
  }
  function nearest(clientX) {
    const rect = wrap.getBoundingClientRect();
    const ux = (clientX - rect.left) / (rect.width / W);
    let best = 0, bd = Infinity;
    for (let i = 0; i < dates.length; i++) { const d = Math.abs(x(i) - ux); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  svg.addEventListener("pointermove", (e) => showAt(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);
  // 키보드 — 다시 그릴 때 핸들러가 쌓이지 않게 on* 속성으로 단다
  wrap.onkeydown = (e) => {
    if (e.key === "ArrowRight") { showAt(Math.min(dates.length - 1, cur + 1)); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { showAt(Math.max(0, (cur < 0 ? dates.length : cur) - 1)); e.preventDefault(); }
    else if (e.key === "Escape") hide();
  };
  wrap.onblur = hide;

  legend.innerHTML = series
    .map((s, i) => `<span class="lg line"><i style="background:${COLORS[i % COLORS.length]}"></i>${s.pyeong}평</span>`)
    .join("");
  note.innerHTML = estSet.size
    ? `점선 구간(${chart.estimatedDates[0].slice(5)}~)은 <b>추정치</b>(현재 매물 등록일 기준), 실선은 <b>실제 수집값</b>입니다. 마우스를 올리면 날짜별 매물 수와 전날 대비 증감이 보입니다.`
    : "마우스를 올리면 날짜별 매물 수와 전날 대비 증감이 보입니다.";
}

// ---------- 실거래 가격추이 (SVG 라인 차트) ----------
// 설계 메모
//  - 거래가 없던 날(price:null)은 선을 끊는다. 없는 값을 이어 그리면 거래가 있었던 것처럼 보인다.
//  - y축은 0에서 시작하지 않는다. 5~9억 가격대에서 0 기준선은 변동을 전부 눌러버린다. 대신 축 범위를 화면과 설명에 밝힌다.
//  - 점은 실제 관측치만 찍는다. 점이 있는 날에만 거래가 있었다는 뜻.
//  - 평형 색은 매물 차트와 같다(색이 순위가 아니라 평형을 따라간다).
function fmtMan(man) {
  if (man == null) return "–";
  const r = Math.round(man / 100) * 100;            // 100만원 단위로 반올림
  const eok = Math.floor(r / 10000), rest = r - eok * 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

// 비교 단지 체크박스 — 켰을 때만 비교 계열을 그린다(선택은 이 브라우저에 기억).
let lastRealChart = null;
const CMP_KEY = "showCompare";
function cmpOn() { try { return localStorage.getItem(CMP_KEY) === "1"; } catch { return false; } }
$("cmp-check").addEventListener("change", (e) => {
  try { localStorage.setItem(CMP_KEY, e.target.checked ? "1" : "0"); } catch {}
  renderRealChart(lastRealChart);
});

function renderRealChart(rc) {
  lastRealChart = rc;
  const wrap = $("real-wrap"), note = $("real-note"), legend = $("real-legend"), tv = $("real-table-view");
  const dates = (rc && rc.dates) || [];
  const allSeries = (rc && rc.series) || [];
  const cmpNames = [...new Set(allSeries.filter((s) => s.compare).map((s) => s.complex))];
  $("cmp-toggle").hidden = !cmpNames.length;
  $("cmp-name").textContent = cmpNames.map((n) => n.replace(/^동탄역/, "")).join(", ");
  $("cmp-check").checked = cmpOn();
  const series = cmpOn() ? allSeries : allSeries.filter((s) => !s.compare);
  const hasAny = series.some((s) => s.data.some((v) => v !== null));
  if (!dates.length || !hasAny) {
    wrap.innerHTML = `<p class="empty">실거래 기록이 쌓이면 그래프가 표시됩니다.</p>`;
    note.textContent = ""; legend.textContent = ""; tv.hidden = true;
    return;
  }

  // y 범위 — 관측값을 5,000만원 단위로 넓혀서 사용
  const vals = [];
  for (const s of series) for (const v of s.data) if (v !== null) vals.push(v);
  const STEP = 5000;
  const lo = Math.floor(Math.min(...vals) / STEP) * STEP;
  const hi = Math.ceil(Math.max(...vals) / STEP) * STEP;
  const ticks = Math.max(1, Math.round((hi - lo) / STEP));

  // 비교 단지 계열은 우리 단지와 겹치지 않는 별도 색 + 점선·속빈 점으로 구분한다.
  // 우리 단지는 팔레트 앞쪽(파랑·주황), 비교 단지는 초록·분홍부터 쓴다.
  const CMP_COLORS = [COLORS[2], COLORS[4], COLORS[5], COLORS[3]];
  const cmpIdx = series.map((s, i) => (s.compare ? i : -1)).filter((i) => i >= 0);
  const colorOf = (si) => series[si].compare
    ? CMP_COLORS[cmpIdx.indexOf(si) % CMP_COLORS.length]
    : COLORS[si % COLORS.length];
  const shortName = (n) => String(n || "").replace(/^동탄역/, "");
  const nameOf = (s) => (s.compare ? `${shortName(s.complex)} ` : "") + `${s.pyeong}평`;

  const W = 760, H = 300, pad = { l: 56, r: 62, t: 16, b: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (dates.length === 1 ? iw / 2 : (iw * i) / (dates.length - 1));
  const y = (v) => pad.t + ih - (ih * (v - lo)) / (hi - lo);

  const NS = "http://www.w3.org/2000/svg";
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const txt = (a, s) => { const t = el("text", a); t.textContent = s; return t; };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", preserveAspectRatio: "xMidYMid meet", role: "img" });

  // y 격자 + 눈금 (억 단위)
  for (let g = 0; g <= ticks; g++) {
    const v = hi - ((hi - lo) * g) / ticks;
    const yy = y(v);
    svg.appendChild(el("line", { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, stroke: INK.grid, "stroke-width": 1 }));
    svg.appendChild(txt({ x: pad.l - 8, y: yy + 4, fill: INK.axis, "font-size": 11, "text-anchor": "end" }, (v / 10000).toFixed(1) + "억"));
  }

  // x 라벨 (최대 8개)
  const step = Math.ceil(dates.length / 8);
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    svg.appendChild(txt({ x: x(i), y: H - pad.b + 18, fill: INK.axis, "font-size": 10, "text-anchor": "middle" }, d.slice(5)));
  });

  // 계열별: 값이 있는 구간만 이어서 그린다(결측에서 끊김) + 관측점 + 마지막 점 직접 라벨
  series.forEach((s, si) => {
    const color = colorOf(si);
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        svg.appendChild(el("polyline", {
          points: run.map((i) => `${x(i)},${y(s.data[i])}`).join(" "),
          fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
          ...(s.compare ? { "stroke-dasharray": "6 5" } : {}),
        }));
      }
      run = [];
    };
    dates.forEach((d, i) => { if (s.data[i] === null) flush(); else run.push(i); });
    flush();

    // 관측점 — r=4 (지름 8px) + 배경색 2px 링
    let lastIdx = -1;
    dates.forEach((d, i) => {
      if (s.data[i] === null) return;
      lastIdx = i;
      svg.appendChild(s.compare
        ? el("circle", { cx: x(i), cy: y(s.data[i]), r: 3.5, fill: INK.ring, stroke: color, "stroke-width": 2 })
        : el("circle", { cx: x(i), cy: y(s.data[i]), r: 4, fill: color, stroke: INK.ring, "stroke-width": 2 }));
    });

    // 직접 라벨 (계열 4개 이하이므로 색에만 의존하지 않게 평형을 바로 적는다)
    if (lastIdx >= 0) {
      const ly = Math.min(pad.t + ih - 2, Math.max(pad.t + 10, y(s.data[lastIdx])));
      svg.appendChild(txt({ x: x(lastIdx) + 9, y: ly + 4, fill: INK.label, "font-size": 11, "font-weight": s.compare ? 400 : 700 }, nameOf(s)));
    }
  });

  // 크로스헤어 + 툴팁
  const hair = el("line", { y1: pad.t, y2: pad.t + ih, stroke: INK.hair, "stroke-width": 1, visibility: "hidden" });
  svg.appendChild(hair);
  const hit = el("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" });
  svg.appendChild(hit);

  wrap.innerHTML = "";
  wrap.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  let cur = -1;
  function showAt(i) {
    if (i < 0 || i >= dates.length) return;
    cur = i;
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i));
    hair.setAttribute("visibility", "visible");

    tip.textContent = "";
    const head = document.createElement("div");
    head.className = "viz-tip-date";
    head.textContent = dates[i];                      // 라벨은 textContent 로만 넣는다
    tip.appendChild(head);
    for (let si = 0; si < series.length; si++) {
      const s = series[si];
      const row = document.createElement("div");
      row.className = "viz-tip-row";
      const key = document.createElement("i");
      key.style.background = s.compare ? `repeating-linear-gradient(90deg, ${colorOf(si)} 0 4px, transparent 4px 6px)` : colorOf(si);
      const val = document.createElement("b");
      val.textContent = s.data[i] === null ? "거래 없음" : fmtMan(s.data[i]);
      const nm = document.createElement("span");
      nm.textContent = nameOf(s) + (s.data[i] !== null && s.counts ? ` · ${s.counts[i]}건` : "");
      row.append(key, val, nm);
      tip.appendChild(row);
    }
    tip.hidden = false;

    // SVG 좌표 → 화면 좌표 (뷰박스가 반응형이라 배율 보정)
    const rect = wrap.getBoundingClientRect();
    const scale = rect.width / W;
    const left = x(i) * scale;
    tip.style.left = Math.max(4, Math.min(rect.width - tip.offsetWidth - 4, left - tip.offsetWidth / 2)) + "px";
    tip.style.top = Math.max(2, pad.t * scale) + "px";
  }
  function hide() { tip.hidden = true; hair.setAttribute("visibility", "hidden"); }
  function nearest(clientX) {
    const rect = wrap.getBoundingClientRect();
    const scale = rect.width / W;
    const ux = (clientX - rect.left) / scale;
    let best = 0, bd = Infinity;
    for (let i = 0; i < dates.length; i++) { const d = Math.abs(x(i) - ux); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  svg.addEventListener("pointermove", (e) => showAt(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);
  // 키보드 — 마우스와 같은 정보를 제공
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { showAt(Math.min(dates.length - 1, (cur < 0 ? -1 : cur) + 1)); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { showAt(Math.max(0, (cur < 0 ? dates.length : cur) - 1)); e.preventDefault(); }
    else if (e.key === "Escape") hide();
  });
  wrap.addEventListener("blur", hide);

  // 범례 — 선 차트이므로 선 모양 키를 쓴다
  legend.innerHTML = series
    .map((s, i) => `<span class="lg line"><i style="background:${s.compare ? `repeating-linear-gradient(90deg, ${colorOf(i)} 0 4px, transparent 4px 7px)` : colorOf(i)}"></i>${esc(nameOf(s))}</span>`)
    .join("");

  const win = (rc && rc.days) || 10;
  note.innerHTML =
    `최근 <b>${win}일</b> 실거래 평균가입니다. 그 기간에 거래가 없던 날은 평균을 낼 수 없어 <b>선이 끊깁니다</b> ` +
    `(점이 찍힌 날만 실제 거래가 있었습니다). 세로축은 변동을 보기 위해 0이 아니라 <b>${(lo / 10000).toFixed(1)}억~${(hi / 10000).toFixed(1)}억</b> 구간만 보여줍니다.` +
    (series.some((s) => s.compare)
      ? ` <b>점선·속빈 점</b>은 비교 단지(${esc([...new Set(series.filter((s) => s.compare).map((s) => s.complex))].join(", "))})입니다.`
      : "");

  // 표로 보기 — 호버 없이도 값에 닿을 수 있게
  const obs = dates.map((d, i) => i).filter((i) => series.some((s) => s.data[i] !== null));
  $("real-table").innerHTML =
    `<table><thead><tr><th>날짜</th>` +
    series.map((s) => `<th class="num">${esc(nameOf(s))}</th>`).join("") +
    `</tr></thead><tbody>` +
    obs.slice().reverse().map((i) =>
      `<tr><td>${dates[i]}</td>` +
      series.map((s) => `<td class="num">${s.data[i] === null ? "–" : fmtMan(s.data[i])}</td>`).join("") +
      `</tr>`
    ).join("") +
    `</tbody></table>`;
  tv.hidden = false;
}

function render(state) {
  // 헤더/요약
  $("complexNo").value = state.complexNo || "";
  $("complexName").value = state.complexName || "";
  $("title").textContent = state.complexName || (state.complexNo ? `단지 ${state.complexNo}` : "단지를 설정해 주세요");

  // 표 헤더 날짜
  $("col-prev").textContent = state.prevDate ? `${state.prevDate}` : "이전";
  $("col-today").textContent = state.todayDate ? `${state.todayDate} (오늘)` : "오늘";
  $("dates").textContent =
    state.prevDate && state.todayDate ? `${state.prevDate} → ${state.todayDate}`
    : state.todayDate ? `기준일: ${state.todayDate} (내일부터 증감 표시)`
    : "";

  // 본문
  const tbody = $("tbody");
  tbody.innerHTML = "";
  if (!state.rows || state.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">아직 데이터가 없습니다. 단지 번호를 넣고 “오늘 매물 갱신”을 눌러주세요.</td></tr>`;
    $("tfoot").hidden = true;
  } else {
    let sp = 0, st = 0;
    for (const r of state.rows) {
      sp += r.prev; st += r.today;
      const d = fmtDelta(r.diff);
      const tr = document.createElement("tr");
      const sub = r.label ? `<span class="sub-label">${r.label}</span>` : "";
      tr.innerHTML =
        `<td><b>${r.pyeong}평</b> ${sub}</td>` +
        `<td class="num">${cntCell(r, "prev")}</td>` +
        `<td class="num">${cntCell(r, "today")}</td>` +
        `<td class="num"><button class="delta-btn ${d.cls}" data-pyeong="${r.pyeong}" data-label="${r.label}" title="매물 목록 보기">${d.txt} <span class="chev">›</span></button></td>` +
        `<td class="num price">${r.avgPrice || "–"}</td>` +
        `<td class="num price real">${r.realPrice ? `${r.realPrice}<span class="real-cnt">최근 ${r.realDays || 10}일 ${r.realCount}건</span>` : "–"}</td>`;
      tbody.appendChild(tr);
    }
    const ds = fmtDelta(st - sp);
    $("sum-prev").textContent = sp || "–";
    $("sum-today").textContent = st || "–";
    $("sum-diff").innerHTML = `<span class="delta ${ds.cls}">${ds.txt}</span>`;
    $("tfoot").hidden = false;
  }

  renderDeals(state.realDeals);

  // 차트
  renderChart(state.chart);
  renderRealChart(state.realChart);
  renderKpis(state);
}

// 최근 n일 전체 매물 수 미니 추이선(KPI 카드용) — 축·라벨 없이 흐름만 보여준다
function sparkline(chart, n) {
  if (!chart || !chart.dates || chart.dates.length < 2) return "";
  const from = Math.max(0, chart.dates.length - n);
  const vals = chart.dates.slice(from).map((_, i) => chart.series.reduce((a, s) => a + (s.data[from + i] || 0), 0));
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 120, H = 34;
  const pts = vals.map((v, i) => [(W * i) / (vals.length - 1), hi === lo ? H / 2 : 3 + (H - 6) * (1 - (v - lo) / (hi - lo))]);
  const line = pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="kpi-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
    `<polyline points="0,${H} ${line} ${W},${H}" class="spark-area"/>` +
    `<polyline points="${line}" class="spark-line"/>` +
    `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" class="spark-dot"/></svg>`;
}

// ---------- 대시보드 요약 지표 ----------
function renderKpis(state) {
  const rows = state.rows || [];
  const today = rows.reduce((a, r) => a + r.today, 0);
  const prev = rows.reduce((a, r) => a + r.prev, 0);
  const d = fmtDelta(today - prev);
  const deals = (state.realDeals && state.realDeals.list) || [];
  const nToday = deals.filter((x) => x.isToday).length;
  const nNew = deals.filter((x) => x.isNew).length;
  const realCnt = rows.reduce((a, r) => a + (r.realCount || 0), 0);
  const realDays = (rows.find((r) => r.realDays) || {}).realDays || 10;
  // 실거래가 가장 많은 평형의 평균가를 대표값으로 보여준다
  const top = rows.filter((r) => r.realPrice).sort((a, b) => b.realCount - a.realCount)[0];
  const tile = (label, value, sub, view, extra = "") =>
    `<a class="kpi" href="#${view}"><span class="kpi-label">${label}</span><b class="kpi-value">${value}</b><span class="kpi-sub">${sub}</span>${extra}</a>`;
  $("kpis").innerHTML = [
    tile("현재 매매 매물", `${today}<small>건</small>`,
      state.prevDate ? `<span class="delta pill ${d.cls}">${d.txt}</span> ${esc(state.prevDate.slice(5))} 대비` : "내일부터 증감 표시", "dashboard",
      sparkline(state.chart, 30)),
    tile(`최근 ${realDays}일 실거래`, `${realCnt}<small>건</small>`,
      top ? `${top.pyeong}평 평균 ${esc(top.realPrice)}` : "거래 없음", "deals"),
    tile("오늘 거래 · 신규 신고", `${nToday} · ${nNew}<small>건</small>`,
      nToday || nNew ? "실거래 목록에서 확인" : "새 소식 없음", "deals"),
    tile("마지막 수집", esc(state.todayDate ? state.todayDate.slice(5).replace("-", "/") : "–"),
      `평형 ${rows.length}개 집계`, "dashboard"),
  ].join("");
  $("side-meta").textContent = state.todayDate ? `마지막 수집 ${state.todayDate}` : "";
}

// ---------- 좌측 메뉴 (주소 #뷰이름 으로 화면 전환) ----------
const VIEWS = ["dashboard", "news", "board", "settings"];
// 화면 대신 대시보드 안의 카드로 가는 주소(#deals → 대시보드의 실거래 목록)
const SECTIONS = { deals: "dashboard" };
function showView() {
  let v = location.hash.slice(1);
  const section = SECTIONS[v] ? v : "";
  if (section) v = SECTIONS[v];
  if (!VIEWS.includes(v) || (STATIC && v === "settings")) v = "dashboard";
  document.querySelectorAll(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
  document.querySelectorAll("#nav a").forEach((a) => {
    if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const cur = document.querySelector(`#nav a[data-view="${v}"]`);
  $("view-name").textContent = cur ? cur.textContent.trim() : "";
  if (section) $(section).scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showView);

// ---------- 개선·문의 (메일 발송) ----------
// 글은 저장하지 않고 PC 서버(/api/contact)가 관리자 메일로만 보낸다.
// 공개 페이지에서는 수동 수집처럼 터널(collectUrl)을 거친다.
const CONTACT_MAX_FILES = 5;
const CONTACT_MAX_BYTES = 8 * 1024 * 1024;
let contactKind = "개선";
$("contact-kind").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]");
  if (!b) return;
  contactKind = b.dataset.k;
  $("contact-kind").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
});
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB"; }
function contactFiles() { return [...$("c-files").files]; }
function checkFiles(files) {
  if (files.length > CONTACT_MAX_FILES) return `첨부는 ${CONTACT_MAX_FILES}개까지 가능합니다.`;
  if (files.reduce((t, f) => t + f.size, 0) > CONTACT_MAX_BYTES) return "첨부 파일 합계가 8MB를 넘습니다.";
  return "";
}
$("c-files").addEventListener("change", () => {
  const files = contactFiles();
  $("c-file-list").innerHTML = files.map((f) => `<li>${esc(f.name)} <span>${fmtSize(f.size)}</span></li>`).join("");
  const err = checkFiles(files);
  if (err) setStatus(err, "error");
});
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
    r.readAsDataURL(file);
  });
}
$("contact-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("c-title").value.trim();
  const body = $("c-body").value.trim();
  if (!title || !body) return setStatus("제목과 내용을 입력해 주세요.", "error");
  const files = contactFiles();
  const err = checkFiles(files);
  if (err) return setStatus(err, "error");
  const base = STATIC ? ((staticData && staticData.collectUrl) || "").replace(/\/$/, "") : "";
  if (STATIC && !base) return setStatus("지금은 PC 서버가 꺼져 있어 보낼 수 없습니다. 나중에 다시 시도해 주세요.", "error");

  const btn = $("c-send");
  btn.disabled = true; btn.textContent = "보내는 중…";
  try {
    const payload = {
      kind: contactKind, title, body,
      name: $("c-name").value.trim(), contact: $("c-contact").value.trim(),
      website: $("c-website").value,
      files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await readBase64(f) }))),
    };
    let res;
    try {
      res = await fetch(base + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error("PC 서버에 연결하지 못했습니다. 나중에 다시 시도해 주세요.");
    }
    let r;
    try { r = await res.json(); } catch { throw new Error(`서버 응답 오류 (HTTP ${res.status})`); }
    if (r.error) throw new Error(r.error);
    $("contact-form").reset();
    $("c-file-list").innerHTML = "";
    setStatus("보냈습니다. 관리자 메일로 전달되었습니다.", "ok");
  } catch (e2) {
    setStatus(e2.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "보내기";
  }
});

// ---------- 실거래 목록 ----------
// 평형 선택 버튼 — 목록에 있는 평형으로 만든다(선택은 이 브라우저에 기억).
let lastDeals = null;
let dealsExpanded = false; // 전체 펼치기 상태(새로고침하면 다시 최근 60일)
const DEALS_PAGE = 100;     // 펼쳤을 때 한 번에 보여줄 건수 — 수백~수천 건을 한꺼번에 그리지 않는다
let dealsLimit = DEALS_PAGE;
$("deals-page").addEventListener("click", () => { dealsLimit += DEALS_PAGE; renderDeals(lastDeals); });
$("deals-toggle").addEventListener("click", () => {
  dealsExpanded = !dealsExpanded;
  dealsLimit = DEALS_PAGE;
  renderDeals(lastDeals);
  if (!dealsExpanded) $("deals").scrollIntoView({ block: "start" }); // 접으면 목록 머리로 돌아간다
});
const DEAL_PY_KEY = "dealPyeong";
function dealPy() { try { return localStorage.getItem(DEAL_PY_KEY) || "all"; } catch { return "all"; } }
$("deals-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-py]");
  if (!b) return;
  try { localStorage.setItem(DEAL_PY_KEY, b.dataset.py); } catch {}
  renderDeals(lastDeals);
});

// 같은 평형의 직전 거래일(더 이른 날짜) 대비 증감 — 그날 거래가 여러 건이면 평균과 비교한다. 해제 건은 제외.
// rows: 화면에 그릴 거래, base: 비교 대상(전체 목록이 있으면 그것 — 60일 맨 끝 거래도 비교되게)
function dealDiffs(rows, base = rows) {
  const out = new Map();
  const valid = base.filter((x) => !x.canceled);
  for (const x of rows) {
    const older = valid.filter((y) => y.pyeong === x.pyeong && y.date < x.date);
    if (!older.length) continue;
    const pd = older.reduce((m, y) => (y.date > m ? y.date : m), "");
    const same = older.filter((y) => y.date === pd);
    const avg = same.reduce((a, y) => a + y.price, 0) / same.length;
    out.set(x, { diff: x.price - avg, prevDate: pd, prevPrice: avg, n: same.length });
  }
  return out;
}
function fmtDiff(d) {
  if (!d) return `<span class="pdiff same">–</span>`;
  const v = Math.round(d.diff / 100) * 100; // 100만원 단위
  const tip = `직전 거래 ${d.prevDate} ${fmtMan(d.prevPrice)}${d.n > 1 ? ` (${d.n}건 평균)` : ""} 대비`;
  if (!v) return `<span class="pdiff same" title="${esc(tip)}">보합</span>`;
  const amt = fmtMan(Math.abs(v)) + (Math.abs(v) < 10000 ? "만" : "");
  return `<span class="pdiff ${v > 0 ? "up" : "down"}" title="${esc(tip)}">${v > 0 ? "▲" : "▼"} ${amt}</span>` +
    `<span class="pdiff-sub">${esc(d.prevDate.slice(5))} 대비</span>`;
}

function renderDeals(rd) {
  lastDeals = rd;
  const body = $("deals-body"), top = $("deals-today"), dl = $("deals-dates");
  const recent = (rd && rd.list) || [];
  const full = (rd && rd.all) || null;          // 실거래 전체(분양권 거래부터) — 수집 전이면 없음
  const showAll = dealsExpanded && !!full;
  const all = showAll ? full : recent;
  const pys = [...new Set(all.map((x) => x.pyeong))].sort((a, b) => a - b);
  let sel = dealPy();
  if (sel !== "all" && !pys.includes(Number(sel))) sel = "all";
  const fb = $("deals-filter");
  fb.hidden = pys.length < 2;
  fb.innerHTML = [["all", "전체"], ...pys.map((p) => [String(p), `${p}평`])]
    .map(([v, t]) => {
      const n = v === "all" ? all.length : all.filter((x) => String(x.pyeong) === v).length;
      return `<button type="button" data-py="${v}" aria-pressed="${v === sel}">${t} <span class="seg-n">${n}</span></button>`;
    }).join("");
  const list = sel === "all" ? all : all.filter((x) => String(x.pyeong) === sel);
  dl.textContent = rd && rd.date ? `${rd.date} 수집` : "";
  if (!rd || !rd.date) {
    body.innerHTML = `<tr><td colspan="6" class="empty">실거래 목록은 다음 “오늘 매물 갱신” 때부터 표시됩니다.</td></tr>`;
    top.hidden = true;
    return;
  }
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${showAll ? "" : "최근 60일 "}${sel === "all" ? "" : sel + "평 "}실거래가 없습니다.</td></tr>`;
  } else {
    const shown = showAll ? list.slice(0, dealsLimit) : list;
    const diffs = dealDiffs(shown, full || all);
    body.innerHTML = shown.map((x) => {
      const tags = [
        x.isToday ? `<span class="tag today">오늘 거래</span>` : "",
        x.isNew ? `<span class="tag new">신규 신고</span>` : "",
        x.canceled ? `<span class="tag cancel">해제</span>` : "",
      ].join("");
      const cls = [x.isToday || x.isNew ? "deal-hl" : "", x.canceled ? "deal-cancel" : ""].join(" ").trim();
      return `<tr class="${cls}"><td>${esc(x.date)}</td>` +
        `<td><b>${esc(x.pyeong)}평</b> <span class="sub-label">${esc(x.excl ? `전용 ${x.excl}㎡` : x.label)}</span></td>` +
        `<td class="num">${x.floor ? esc(x.floor) + "층" : "–"}</td>` +
        `<td class="num price real">${esc(x.priceText)}</td>` +
        `<td class="num">${x.canceled ? "–" : fmtDiff(diffs.get(x))}</td>` +
        `<td class="tags">${tags}</td></tr>`;
    }).join("");
  }
  // 전체 펼치기 버튼 — 전체 목록이 60일 목록보다 많을 때만
  const more = $("deals-more"), tg = $("deals-toggle");
  more.hidden = !full || full.length <= recent.length;
  if (!more.hidden) {
    const nFull = sel === "all" ? full.length : full.filter((x) => String(x.pyeong) === sel).length;
    tg.textContent = showAll ? "▲ 최근 60일만 보기" : `▼ 전체 펼치기 (${nFull}건)`;
    const rest = showAll ? list.length - dealsLimit : 0;
    $("deals-page").hidden = rest <= 0;
    if (rest > 0) $("deals-page").textContent = `더 보기 (${Math.min(DEALS_PAGE, rest)}건 · 남은 ${rest}건)`;
    tg.setAttribute("aria-expanded", showAll);
  }
  const oldest = full && full.length ? full[full.length - 1].date : "";
  $("deals-range").textContent = showAll ? `거래일 기준 전체(${oldest} ~)` : "거래일 기준 최근 60일";
  const nToday = list.filter((x) => x.isToday).length;
  const nNew = list.filter((x) => x.isNew).length;
  if (nToday || nNew) {
    top.hidden = false;
    top.innerHTML = [nToday && `오늘(${esc(rd.today)}) 거래 <b>${nToday}건</b>`, nNew && `새로 신고된 실거래 <b>${nNew}건</b>`].filter(Boolean).join(" · ");
  } else {
    top.hidden = false;
    top.className = "deals-today none";
    top.textContent = "오늘 거래·신규 신고된 실거래는 없습니다.";
    return;
  }
  top.className = "deals-today";
}

// ---------- 최신 기사 (동탄트램 / 동탄 소식) ----------
function fmtNewsTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderNews(n, prefix = "news") {
  const box = $(`${prefix}-list`), meta = $(`${prefix}-meta`);
  const items = (n && n.items) || [];
  const nToday = items.filter((x) => x.isToday).length;
  meta.textContent = n && n.fetchedAt ? `${nToday ? `오늘 ${nToday}건 · ` : ""}${fmtNewsTime(n.fetchedAt)} 기준` : "";
  if (!items.length) {
    box.innerHTML = `<p class="empty-sm">${n && n.error ? "기사를 불러오지 못했습니다." : "관련 기사가 없습니다."}</p>`;
    return;
  }
  box.innerHTML = (nToday ? "" : `<p class="chg-note">오늘 나온 기사는 없어 최신 기사를 보여줍니다.</p>`) +
    items.map((x) =>
      `<a class="news-item" href="${esc(x.link)}" target="_blank" rel="noopener">` +
      `<div class="news-title">${x.isToday ? `<span class="tag today">오늘</span> ` : ""}${esc(x.title)}</div>` +
      `<div class="news-meta">${esc(x.source)} · ${fmtNewsTime(x.time)}</div></a>`
    ).join("");
}

async function load() {
  render(await api("/api/state"));
  try { renderNews(await api("/api/news")); }
  catch { renderNews(null); }
  try { renderNews(await api("/api/news?topic=dongtan"), "dt-news"); }
  catch { renderNews(null, "dt-news"); }
}

// ---------- 증감 매물 목록 모달 ----------
function fmtConfirm(ymd) {
  if (!ymd || ymd.length < 8) return "";
  return `${ymd.slice(4, 6)}/${ymd.slice(6, 8)} 확인`;
}
// 등록 경과일 — 서버가 계산한 최초 등장일 기준
function ageTag(r) {
  if (r.days == null) return "";
  if (r.beforeStart) return `<span class="age old" title="기록 시작(${esc(r.firstSeen)}) 이전부터 있던 매물">${r.days}일+</span>`;
  if (r.days === 0) return `<span class="age new" title="최초 등장 ${esc(r.firstSeen)}">오늘 등록</span>`;
  return `<span class="age${r.days <= 7 ? " recent" : ""}" title="최초 등장 ${esc(r.firstSeen)}">${r.days}일 경과</span>`;
}
function articleItem(complexNo, r) {
  const url = `https://new.land.naver.com/complexes/${complexNo}?articleNo=${r.no}`;
  const meta = [r.floor && `${r.floor}층`, r.excl && `전용 ${r.excl}㎡`, r.dir, fmtConfirm(r.confirm)]
    .filter(Boolean).join(" · ");
  return (
    `<a class="item" href="${url}" target="_blank" rel="noopener">` +
    `<div class="item-top"><span class="item-price">${r.price || "-"} ${ageTag(r)}</span>` +
    `<span class="item-bldg">${r.bldg || ""}</span></div>` +
    `<div class="item-meta">${meta}</div>` +
    (r.desc ? `<div class="item-desc">${r.desc}</div>` : "") +
    `<div class="item-realtor">${r.realtor || ""}</div></a>`
  );
}
function listBlock(title, cls, items, complexNo, emptyMsg) {
  const body = items.length
    ? items.map((r) => articleItem(complexNo, r)).join("")
    : `<p class="empty-sm">${emptyMsg}</p>`;
  return `<div class="chg-block"><h4 class="${cls}">${title} (${items.length})</h4>${body}</div>`;
}
// 재등록 매물 — 어제 매물(before)이 오늘 같은 동·층·전용으로 새 번호 재등록(after)
function relistedItem(complexNo, pair) {
  const a = pair.after, b = pair.before;
  const url = `https://new.land.naver.com/complexes/${complexNo}?articleNo=${a.no}`;
  const meta = [a.floor && `${a.floor}층`, a.excl && `전용 ${a.excl}㎡`, a.dir, fmtConfirm(a.confirm)]
    .filter(Boolean).join(" · ");
  const price = (b.price && a.price && b.price !== a.price)
    ? `<span class="item-price">${b.price} → ${a.price}</span>`
    : `<span class="item-price">${a.price || "-"}</span>`;
  const age = ageTag(a);
  return (
    `<a class="item relisted" href="${url}" target="_blank" rel="noopener">` +
    `<div class="item-top"><span>${price} ${age}</span><span class="item-bldg">${a.bldg || ""}</span></div>` +
    `<div class="item-meta">${meta}</div>` +
    (a.desc ? `<div class="item-desc">${a.desc}</div>` : "") +
    `<div class="item-realtor">${a.realtor || ""}</div></a>`
  );
}
function relistedBlock(complexNo, pairs) {
  if (!pairs || !pairs.length) return "";
  return `<div class="chg-block"><h4 class="neutral">🔁 재등록 (단순 갱신·거래 아님) (${pairs.length})</h4>` +
    pairs.map((p) => relistedItem(complexNo, p)).join("") + `</div>`;
}
async function openChanges(pyeong, label) {
  const box = $("modal-content");
  box.innerHTML = `<p class="empty-sm">불러오는 중…</p>`;
  $("modal").hidden = false;
  let c;
  try { c = await api(`/api/changes?pyeong=${pyeong}`); }
  catch (e) { box.innerHTML = `<p class="empty-sm">불러오기 실패: ${e.message}</p>`; return; }

  const head = `<h3>${pyeong}평 <span class="sub-label">${label || ""}</span></h3>`;
  const cn = c.complexNo;

  if (c.available) {
    box.innerHTML =
      head +
      `<p class="chg-dates">${c.prevDate} → ${c.todayDate} 변동</p>` +
      `<p class="chg-note">‘사라진 매물(거래 추정)’은 어제 매물 중 오늘 같은 동·층·전용으로 재등록되지 않고 없어진 건이에요. 재등록(단순 갱신)은 아래에 따로 분리했습니다.</p>` +
      listBlock("🟢 사라진 매물 (거래 추정)", "down", c.sold, cn, "거래로 사라진 매물 없음") +
      listBlock("🔴 새로 올라온 매물 (신규)", "up", c.added, cn, "신규 매물 없음") +
      relistedBlock(cn, c.relisted);
  } else if (c.reason === "need-2-days") {
    box.innerHTML =
      head +
      `<p class="chg-note">매물 단위 비교는 2일치 기록이 필요해요. 오늘(${c.todayDate}) 기록됨 → <b>내일부터</b> 추가/사라진 매물이 표시됩니다.</p>` +
      listBlock(`현재 ${pyeong}평 매물 목록`, "neutral", c.current || [], cn, "매물 없음");
  } else {
    box.innerHTML = head + `<p class="empty-sm">아직 매물 기록이 없습니다. “오늘 매물 갱신”을 먼저 눌러주세요.</p>`;
  }
}
// 전일/오늘 건수 클릭 → 그 날짜의 평형별 매물 목록
// /api/changes 가 이미 current(오늘)·prevList(전일)를 함께 주므로 추가 API 없이 재사용한다.
async function openDayList(pyeong, label, which) {
  const box = $("modal-content");
  box.innerHTML = `<p class="empty-sm">불러오는 중…</p>`;
  $("modal").hidden = false;
  let c;
  try { c = await api(`/api/changes?pyeong=${encodeURIComponent(pyeong)}`); }
  catch (e) { box.innerHTML = `<p class="empty-sm">불러오기 실패: ${esc(e.message)}</p>`; return; }

  const isPrev = which === "prev";
  const head = `<h3>${esc(pyeong)}평 <span class="sub-label">${esc(label)}</span></h3>`;
  const cn = c.complexNo;

  // 전일 목록은 2일치 기록이 있어야 만들 수 있다
  if (isPrev && !c.available) {
    box.innerHTML = head + `<p class="chg-note">전일 매물 목록은 2일치 기록이 필요합니다. 아직 비교할 이전 기록이 없습니다.</p>`;
    return;
  }
  const list = isPrev ? (c.prevList || []) : (c.current || []);
  const date = isPrev ? c.prevDate : c.todayDate;
  box.innerHTML =
    head +
    `<p class="chg-dates">${esc(date)} 기준${isPrev ? " (전일)" : " (오늘)"} · 최근 등록순</p>` +
    listBlock(`${isPrev ? "전일" : "오늘"} ${esc(pyeong)}평 매물`, "neutral", list, cn, "이 날짜에 기록된 매물이 없습니다.");
}

function closeModal() {
  $("modal").hidden = true;
  if (pwResolve) { const r = pwResolve; pwResolve = null; r(null); } // 비밀번호 창을 닫으면 취소
}
$("modal").addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
$("tbody").addEventListener("click", (e) => {
  const delta = e.target.closest(".delta-btn");
  if (delta) { openChanges(delta.dataset.pyeong, delta.dataset.label); return; }
  const cnt = e.target.closest(".cnt-btn");
  if (cnt) openDayList(cnt.dataset.pyeong, cnt.dataset.label, cnt.dataset.which);
});

$("save-config").addEventListener("click", async () => {
  const state = await api("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complexNo: $("complexNo").value, complexName: $("complexName").value }),
  });
  render(state);
  setStatus("단지 정보를 저장했습니다.", "ok");
});

// 정적 페이지의 수동 수집 — 터널(collectUrl)을 거쳐 PC 서버에 수집을 요청한다.
// 응답의 state·changes 로 화면을 바로 갱신하고, 공개 페이지 자체는 서버가 다시 게시한다.
// 수동 수집은 비밀번호로 로그인해야 한다. 맞춘 비밀번호는 이 탭(sessionStorage)에만 기억한다.
const PW_KEY = "refreshPw";
function savedPw() { try { return sessionStorage.getItem(PW_KEY) || ""; } catch { return ""; } }
function savePw(v) { try { if (v) sessionStorage.setItem(PW_KEY, v); else sessionStorage.removeItem(PW_KEY); } catch {} }
let pwResolve = null; // 비밀번호 창이 열려 있을 때의 응답 함수
function askPassword(msg) {
  return new Promise((resolve) => {
    pwResolve = resolve;
    $("modal-content").innerHTML =
      `<h3>수동 수집 로그인</h3>` +
      `<form id="pw-form" class="pw-form">` +
      `<p class="chg-dates">${esc(msg || "수동 수집은 비밀번호가 필요합니다. 평소에는 30분마다 자동으로 수집됩니다.")}</p>` +
      `<div class="field"><label for="pw-input">비밀번호</label>` +
      `<input type="password" id="pw-input" inputmode="numeric" autocomplete="current-password" required /></div>` +
      `<div class="contact-actions"><button type="submit" class="btn primary">로그인 후 수집</button></div>` +
      `</form>`;
    $("modal").hidden = false;
    $("pw-input").focus();
    $("pw-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("pw-input").value.trim();
      if (!v) return;
      pwResolve = null;
      closeModal();
      resolve(v);
    });
  });
}

async function remoteRefresh() {
  const base = (staticData && staticData.collectUrl) || "";
  if (!base) throw new Error("수집 서버 주소가 설정되지 않았습니다.");
  let pw = savedPw() || await askPassword();
  if (!pw) return null; // 창을 닫음 → 취소
  let res;
  try {
    res = await fetch(base.replace(/\/$/, "") + "/api/refresh?static=1", {
      method: "POST",
      headers: { "bypass-tunnel-reminder": "1", "x-refresh-password": pw }, // localtunnel 안내 페이지 건너뛰기
    });
  } catch {
    throw new Error("PC 서버에 연결하지 못했습니다. PC에서 서버(server.js)와 터널(tunnel.js)이 켜져 있는지 확인해 주세요.");
  }
  let r;
  try { r = await res.json(); }
  catch { throw new Error(`PC 서버 응답 오류 (HTTP ${res.status}). 서버·터널 상태를 확인해 주세요.`); }
  if (r.auth) { savePw(""); return r; } // 비밀번호 틀림 — 다음에 다시 묻는다
  savePw(pw);
  if (!r.error) {
    const { changes, ...state } = r;
    staticData.state = state;
    if (changes) staticData.changes = changes;
    staticData.generatedAt = new Date().toISOString();
  }
  return r;
}

$("refresh").addEventListener("click", async () => {
  const btn = $("refresh");
  const lb = $("refresh-label");
  const label = lb.textContent;
  btn.disabled = true; btn.classList.add("busy"); lb.textContent = "수집 중…";
  setStatus("네이버에서 매매 매물을 가져오는 중입니다… (10~20초)", "info");
  try {
    const r = STATIC ? await remoteRefresh() : await api("/api/refresh", { method: "POST" });
    if (!r) { setStatus("수동 수집을 취소했습니다.", "info"); }
    else if (r.error) { setStatus(r.error, "error"); }
    else if (r.warning) { setStatus(r.warning, "error"); render(r); }
    else {
      const note = STATIC ? " 공개 페이지에는 1~2분 뒤 반영됩니다." : "";
      setStatus(`갱신 완료 — 매매 매물 ${r.fetched}건 수집됨.${note}`, "ok");
      render(r);
    }
  } catch (e) {
    setStatus(STATIC ? e.message : "요청 실패: " + e.message, "error");
  } finally {
    btn.disabled = false; btn.classList.remove("busy"); lb.textContent = label;
  }
});

if (STATIC) {
  // 단지 설정은 PC 서버에서만 — 정적 페이지에서는 메뉴를 숨긴다. 수집 버튼은 터널로 PC 서버에 요청한다.
  $("nav-settings").hidden = true;
  $("refresh-label").textContent = "지금 수동 수집";
  showView();
  load().then(() => {
    if (!staticData || !staticData.collectUrl) $("refresh").style.display = "none";
    const t = staticData && staticData.generatedAt ? new Date(staticData.generatedAt).toLocaleString("ko-KR") : "";
    $("subtitle").textContent = `매매 매물만 집계합니다. 30분마다 자동 갱신 · 마지막 갱신 ${t}`;
  });
} else {
  showView();
  load();
}
