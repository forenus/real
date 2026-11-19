// 관리자 메뉴 — 사이트 인프라 구성도. 관리자 비밀번호를 맞춘 요청에만 server.js 가 이 HTML 을 돌려준다.
// 공개 페이지(docs/)에는 복사되지 않는다. 운영 상태·파일 크기·수정 시각은 요청할 때마다 실제 값으로 채운다.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (ms) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${m % 60}분` : `${m}분`;
}
const ago = (ms) => (Date.now() - ms < 60000 ? "방금" : `${span(Date.now() - ms)} 전`);

function fileInfo(name) {
  try {
    const st = fs.statSync(path.join(ROOT, name));
    const kb = st.size / 1024;
    return { ok: true, size: kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(kb))}KB`, at: clock(st.mtimeMs) };
  } catch { return { ok: false }; }
}

// 저장 범위 — 표시 이름과 색
const SCOPE = {
  pub: ["공개 · GitHub", "public"],
  pc: ["비공개 · PC", "private"],
  secret: ["비밀 · PC만", "secret"],
  mem: ["메모리", "mem"],
  none: ["저장 안 함", "none"],
};
const tag = (k, label) => `<span class="inf-tag ${SCOPE[k][1]}">${esc(label || SCOPE[k][0])}</span>`;
const chips = (arr) => arr.map((t) => `<span class="inf-chip">${esc(t)}</span>`).join("");

// 저장 파일 — [파일, 내용, 범위, 바뀌는 때]
const STORES = [
  ["history.json", "날짜별 매물 스냅샷·실거래 원본", "pc", "30분 수집"],
  ["docs/data.json", "공개 페이지용 요약 데이터(뉴스·터널 주소 포함)", "pub", "게시할 때"],
  ["hogangnono.json", "호갱노노 방문자 수·실거래", "pc", "3분마다"],
  ["molit-deals.json", "국토교통부 실거래(동 포함)", "pc", "하루 1회"],
  ["dong-overrides.json", "관리자가 입력한 실거래 동", "pc", "동 입력할 때"],
  ["analysis.json", "AI 추이 해설 결과", "pc", "수집할 때"],
  ["guestbook.json", "방명록 글·댓글·이모티콘 반응", "pc", "글·반응 남길 때"],
  ["stats.json", "방문 기록·접속 통계", "pc", "방문할 때"],
  ["config.json", "단지 번호·비교 단지·호갱노노 주소", "pub", "설정 저장"],
  ["secret.json", "비밀번호·Claude API 키", "secret", "수동 편집"],
  ["mail.json", "Gmail 발송 계정", "secret", "수동 편집"],
  ["tunnel-url.txt", "현재 터널 주소", "pc", "터널 시작"],
];

// 기능 한눈에 보기 — [기능, 화면 위치, 처리(파일), 쓰는 기술, 저장[[범위, 이름]], 주기]
const FEATURES = [
  ["매물 수집", "대시보드 · 수동 수집 버튼", "naver.js", ["Playwright", "Chromium"], [["pc", "history.json"]], "30분"],
  ["실거래 가격추이", "대시보드 그래프·표", "naver.js · hogangnono.js", ["Playwright", "SVG 차트"], [["pc", "history.json"], ["pc", "hogangnono.json"]], "30분"],
  ["동별 분석", "동별 분석 메뉴", "molit.js · server.js", ["국토부 CSV", "SVG 차트"], [["pc", "molit-deals.json"], ["pc", "dong-overrides.json"]], "하루 1회"],
  ["AI 추이 해설", "그래프 아래 해설", "analysis.js", ["Claude Opus 5.5"], [["pc", "analysis.json"]], "수집할 때"],
  ["지역 소식", "지역 소식 메뉴", "news.js", ["Google 뉴스 RSS"], [["pub", "data.json"]], "게시할 때"],
  ["방명록·댓글", "방명록 메뉴", "guestbook.js", ["Claude Haiku 5.5 검사", "Gmail 알림"], [["pc", "guestbook.json"]], "글 쓸 때"],
  ["이모티콘 반응", "방명록 글·댓글 아래", "guestbook.js", ["브라우저 토큰 해시"], [["pc", "guestbook.json"]], "누를 때"],
  ["개선·문의", "개선·문의 메뉴", "server.js", ["nodemailer", "Gmail SMTP"], [["none", "저장 안 함(메일만)"]], "보낼 때"],
  ["현재 접속자", "왼쪽 접속자 목록", "stats.js", ["20초 신호"], [["mem"]], "20초"],
  ["접속 통계", "접속 통계 메뉴", "stats.js", ["방문 기록"], [["pc", "stats.json"]], "방문할 때"],
  ["공개 사이트 게시", "forenus.github.io/real", "server.js", ["git push", "GitHub Pages"], [["pub", "docs/"]], "30분"],
  ["상단 시계·바로가기", "머리말 · 대시보드", "app.js", ["Intl 한국 시각", "호갱노노·아파트너 링크"], [["none"]], "1초"],
];

// API — [주소, 방식, 하는 일, 권한]
const APIS = [
  ["/api/state", "GET", "대시보드 데이터", "open"],
  ["/api/refresh", "POST", "수동 수집 + 게시", "pw"],
  ["/api/publish", "POST", "공개 사이트 다시 게시", "local"],
  ["/api/presence", "POST", "현재 접속자 신호", "open"],
  ["/api/hit", "POST", "방문 기록", "open"],
  ["/api/stats", "GET", "접속 통계", "pw"],
  ["/api/dong-override", "POST", "실거래 동 입력", "pw"],
  ["/api/guestbook", "GET·POST", "방명록 목록·글쓰기(AI 검사)", "open"],
  ["/api/guestbook/react", "POST", "이모티콘 반응 누르기·취소", "open"],
  ["/api/guestbook/delete", "POST", "글·댓글 지우기", "post"],
  ["/api/contact", "POST", "개선·문의 메일", "open"],
  ["/api/admin/infra", "GET", "이 화면", "admin"],
];
const AUTH = {
  open: ["누구나", "public"],
  post: ["글 비밀번호·관리자", "private"],
  pw: ["수집 비밀번호", "secret"],
  admin: ["관리자 비밀번호", "secret"],
  local: ["PC 에서만", "none"],
};

const STACK = [
  ["실행", ["Node.js (내장 http)", "Windows 작업 스케줄러"]],
  ["수집", ["Playwright + Chromium", "국토부 실거래 CSV", "Google 뉴스 RSS"]],
  ["AI", ["Claude Opus 5.5 — 추이 해설", "Claude Haiku 5.5 — 방명록 검사"]],
  ["알림", ["nodemailer", "Gmail SMTP"]],
  ["공개", ["GitHub Pages", "Cloudflare Quick Tunnel"]],
  ["화면", ["바닐라 JS", "SVG 직접 그린 차트", "PWA(홈 화면 앱)"]],
];

const JOBS = [
  ["20초", "열린 화면이 현재 접속자 신호를 보냄"],
  ["3분", "호갱노노 실시간 방문자 수(게시 없이 접속자 응답으로 전달)"],
  ["10분", "Windows 작업 스케줄러 '매물추적기 감시' — 서버·터널이 꺼져 있으면 다시 실행"],
  ["30분", "네이버 매물 → 호갱노노 실거래 → 국토부(하루 1회) → AI 해설 → GitHub 게시"],
];

const node = (cls, title, items) =>
  `<div class="inf-node ${cls}"><b>${title}</b>${items ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}</div>`;

// 운영 상태 카드 하나 — state: ok / warn / bad / "" (중립)
const kpi = (label, value, sub, state = "") =>
  `<div class="inf-kpi ${state}"><span class="inf-kpi-label">${state ? `<i aria-hidden="true"></i>` : ""}${esc(label)}</span>` +
  `<b>${esc(value)}</b><small title="${esc(sub || "")}">${esc(sub || "")}</small></div>`;

// ---------- 개발구성: 시스템 수치 + 한눈에 보는 구성도 ----------
const os = require("os");
const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fullClock = (ms) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

// 데이터 파일(JSON) — 설정·패키지 파일은 빼고 센다
function dataFiles() {
  const skip = new Set(["package.json", "package-lock.json", "manifest.json", "config.json"]);
  const out = [];
  for (const dir of ["", "viewer"]) {
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, dir)); } catch {}
    for (const n of names) {
      if (!n.endsWith(".json") || (!dir && skip.has(n))) continue;
      try { out.push(fs.statSync(path.join(ROOT, dir, n)).size); } catch {}
    }
  }
  return { count: out.length, bytes: out.reduce((a, b) => a + b, 0) };
}
function guestbookCounts() {
  try {
    const { total, list } = require("./guestbook").list();
    let replies = 0, reacts = 0;
    for (const x of list) {
      replies += (x.replies || []).length;
      for (const y of [x, ...(x.replies || [])]) for (const r of y.reacts || []) reacts += r.n;
    }
    return { total, replies, reacts };
  } catch { return { total: 0, replies: 0, reacts: 0 }; }
}

const sysCard = (value, label) => `<div class="dg-kpi"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
function sysCards(st) {
  const up = process.uptime() * 1000;
  const data = dataFiles();
  let disk = null;
  try { const s = fs.statfsSync(ROOT); disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch {}
  const memTotal = os.totalmem(), memUsed = memTotal - os.freemem(), rss = process.memoryUsage().rss;
  const gb = guestbookCounts();
  return `<div class="dg-kpis">` +
    sysCard(span(up), `앱 가동 시간 (마지막 재시작 ${fullClock(Date.now() - up)})`) +
    sysCard(fmtBytes(data.bytes), `데이터 크기 (JSON 파일 ${data.count}개)`) +
    sysCard(disk ? fmtBytes(disk.free) : "–", disk ? `디스크 남은 공간 (전체 ${fmtBytes(disk.total)})` : "디스크 남은 공간") +
    sysCard(fmtBytes(memUsed), `메모리 사용 (전체 ${fmtBytes(memTotal)}, 앱 ${fmtBytes(rss)})`) +
    sysCard(`${gb.total}개`, `방명록 (댓글 ${gb.replies} · 반응 ${gb.reacts})`) +
    sysCard(`${(st && st.online) || 0}명`, "지금 접속자 (최근 1분 신호)") +
    `</div>`;
}

// 구성도 — SVG 한 장(가로 1280 기준). 좁은 화면에서는 가로로 밀어서 본다.
function diagram() {
  const data = dataFiles();
  const up = span(process.uptime() * 1000);
  const T = (x, y, cls, s) => `<text x="${x}" y="${y}" class="${cls}">${esc(s)}</text>`;
  const box = (x, y, w, h, cls, icon, title, lines) =>
    `<g class="dg-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" />` +
    T(x + 20, y + 33, "dg-title", `${icon} ${title}`) +
    lines.map((l, i) => T(x + 20, y + 58 + i * 22, "dg-sub", l)).join("") + `</g>`;
  // 꺾인 화살표: pts = [[x,y],...], 마지막 점에 화살촉
  const edge = (pts, cls = "") =>
    `<polyline class="dg-edge ${cls}" points="${pts.map((p) => p.join(",")).join(" ")}" marker-end="url(#dg-arrow${cls.includes("accent") ? "-accent" : ""})" />`;
  const label = (x, y, s, anchor = "start", cls = "") => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="dg-label ${cls}">${esc(s)}</text>`;

  return `<div class="dg-wrap"><svg class="dg-svg" viewBox="0 0 1280 680" role="img" aria-label="사이트 구성도: 사용자는 GitHub Pages 의 공개 화면과 Cloudflare 터널을 거친 PC 의 Node.js 서버를 쓰고, 서버는 JSON 파일에 저장하며 네이버·호갱노노를 수집하고 Claude API 와 Gmail 을 호출한다">
  <defs>
    <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-head" /></marker>
    <marker id="dg-arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-head accent" /></marker>
  </defs>

  <rect x="550" y="30" width="440" height="635" rx="18" class="dg-group" />
  ${T(575, 68, "dg-gtitle", "💻 내 PC · Windows")}
  ${T(575, 92, "dg-sub", "D:\\ANTI\\real · 꺼지면 실시간 기능이 멈춤")}

  ${box(20, 270, 200, 120, "user", "👤", "사용자", ["PC · 휴대폰 브라우저", "홈 화면 앱(PWA)", "대시보드·방명록·문의"])}
  ${box(260, 110, 240, 120, "net", "🌐", "Cloudflare 터널", ["무료 · *.trycloudflare.com", "실행마다 주소가 바뀜", "→ data.json 에 기록"])}
  ${box(260, 420, 240, 110, "plain", "🐙", "GitHub Pages", ["forenus.github.io/real", "공개 화면 + data.json", "소스 코드 저장소(공개)"])}

  ${box(575, 115, 390, 90, "net", "🔒", "cloudflared (tunnel.js)", ["PC 서버를 https 로 내보냄 · 끊기면 재연결"])}
  ${box(575, 245, 390, 110, "app", "⚙️", "Node.js 앱 (server.js)", ["API · 30분 자동 수집 · 게시 · 방명록", `Node ${process.version} · 포트 5173 · 가동 ${up}`])}
  ${box(575, 395, 390, 100, "data", "🗄️", "JSON 파일 (DB 없음)", [`매물 이력·방명록·통계·실거래 (${fmtBytes(data.bytes)})`, "비밀값 secret·mail 은 GitHub 에 안 올림"])}
  ${box(575, 540, 390, 95, "plain", "🕒", "작업 스케줄러 · 10분마다", ["서버·터널이 꺼져 있으면 다시 실행", "로그인할 때 자동 시작"])}

  ${box(1040, 60, 220, 120, "ext", "🏠", "수집 대상", ["네이버 부동산 · 호갱노노", "국토부 실거래", "Google 뉴스 RSS"])}
  ${box(1040, 260, 220, 105, "ext", "🤖", "Claude API", ["추이 해설 (Opus 5.5)", "방명록 검사 (Haiku 5.5)"])}
  ${box(1040, 430, 220, 105, "ext", "✉️", "Gmail SMTP", ["문의 · 방명록 알림 메일", "nodemailer"])}

  ${edge([[220, 305], [240, 305], [240, 167], [258, 167]])}
  ${label(234, 236, "실시간 API", "end")}
  ${edge([[220, 355], [240, 355], [240, 475], [258, 475]])}
  ${label(234, 420, "공개 화면 · HTTPS", "end")}
  ${edge([[500, 160], [573, 160]])}
  ${label(537, 150, "터널", "middle")}
  ${edge([[770, 205], [770, 243]])}
  ${label(782, 229, "localhost:5173")}
  ${edge([[770, 355], [770, 393]])}
  ${label(782, 379, "읽기 · 쓰기")}
  ${edge([[575, 330], [530, 330], [530, 475], [502, 475]], "accent")}
  ${label(524, 402, "30분마다 git push", "end", "accent")}
  ${edge([[965, 587], [985, 587], [985, 340], [967, 340]], "dash")}
  ${label(979, 521, "꺼지면 다시 실행", "end")}
  ${edge([[965, 265], [1000, 265], [1000, 120], [1038, 120]])}
  ${label(1046, 212, "Playwright 브라우저 수집")}
  ${edge([[965, 290], [1010, 290], [1010, 312], [1038, 312]])}
  ${edge([[965, 315], [1020, 315], [1020, 482], [1038, 482]])}
  ${label(1046, 404, "알림 메일")}
</svg></div>`;
}

function devSection(st) {
  return `<div class="dg-banner"><h2>개발구성</h2></div>
<div class="dg-bar"><span><b>조회 시각</b> ${esc(fullClock(Date.now()))}</span>
  <span class="dg-actions"><button type="button" class="btn adm-reload">새로 고침</button><button type="button" class="btn adm-lock">🔒 잠그기</button></span></div>
${sysCards(st)}
<section class="card"><h2>한눈에 보는 구성도</h2>${diagram()}</section>`;
}

function statusCards(st) {
  if (!st) return `<p class="hint">운영 상태를 읽지 못했습니다.</p>`;
  const now = Date.now();
  const { auto, publish: pub } = st;
  return `<div class="inf-kpis">` +
    (st.collecting
      ? kpi("마지막 자동 수집", "지금 수집 중…", auto ? `직전: ${clock(auto.at)} · ${auto.msg}` : "몇 분 걸립니다", "warn")
      : kpi("마지막 자동 수집", auto ? ago(auto.at) : "아직 없음", auto ? `${clock(auto.at)} · ${auto.msg}` : "서버 시작 직후 한 번 돕니다", auto ? (auto.ok ? "ok" : "bad") : "warn")) +
    kpi("다음 자동 수집", st.nextAutoAt > now ? `${span(st.nextAutoAt - now)} 뒤` : "곧", clock(st.nextAutoAt)) +
    kpi("마지막 게시", pub ? ago(pub.at) : "아직 없음", pub ? `${clock(pub.at)} · ${pub.msg}` : "자동 수집 뒤 게시합니다", pub ? (pub.ok ? "ok" : "bad") : "warn") +
    kpi("터널", st.tunnel ? "연결됨" : "주소 없음", st.tunnel ? st.tunnel.replace(/^https:\/\//, "") : "tunnel.js 를 확인하세요", st.tunnel ? "ok" : "bad") +
    `</div>`;
}

function render(st) {
  const files = STORES.map(([f, what, scope, when]) => {
    const i = fileInfo(f);
    return `<tr><td><code>${esc(f)}</code></td><td>${esc(what)}</td><td>${tag(scope)}</td>` +
      `<td>${esc(when)}</td><td class="num">${i.ok ? esc(i.size) : "없음"}</td><td class="num">${i.ok ? esc(i.at) : "–"}</td></tr>`;
  }).join("");

  const features = FEATURES.map(([f, ui, how, tech, store, every]) =>
    `<tr><td><b>${esc(f)}</b><small>${esc(ui)}</small></td><td><code>${esc(how)}</code></td>` +
    `<td><div class="inf-chips">${chips(tech)}</div></td>` +
    `<td><div class="inf-chips">${store.map(([k, n]) => tag(k, n)).join("")}</div></td><td class="num">${esc(every)}</td></tr>`).join("");

  const apis = APIS.map(([u, m, what, a]) =>
    `<tr><td><code>${esc(u)}</code></td><td><span class="inf-method">${esc(m)}</span></td><td>${esc(what)}</td>` +
    `<td><span class="inf-tag ${AUTH[a][1]}">${esc(AUTH[a][0])}</span></td></tr>`).join("");

  return `${devSection(st)}
<section class="card">
  <div class="table-head"><h2>운영 상태</h2><span class="dates">${esc(clock(Date.now()))} 기준 · 메뉴를 다시 열면 새로 읽습니다</span></div>
  ${statusCards(st)}
</section>

<section class="card">
  <div class="table-head"><h2>인프라 구성도</h2><span class="dates">데이터가 흐르는 방향 →</span></div>
  <div class="inf-flow">
    <div class="inf-col">
      <h3>① 외부 데이터</h3>
      ${node("src", "네이버 부동산", ["매물 목록", "실거래"])}
      ${node("src", "호갱노노", ["실거래(최근 60일)", "실시간 방문자"])}
      ${node("src", "국토교통부 실거래가", ["CSV 내려받기", "동 정보"])}
      ${node("src", "Google 뉴스 RSS", ["동탄·트램 기사"])}
    </div>
    <div class="inf-arrow" aria-hidden="true"><span>Playwright<br />브라우저 수집</span></div>
    <div class="inf-col">
      <h3>② 내 PC (수집 서버)</h3>
      ${node("pc", "Node.js 서버 <code>server.js</code> :5173", ["30분 자동 수집·게시", "API 제공(수집·방명록·반응·통계 등)"])}
      ${node("pc store", "로컬 저장 (JSON 파일)", ["history · guestbook · stats 등", "비밀값: secret · mail"])}
      ${node("pc", "감시 작업 (작업 스케줄러)", ["10분마다 서버·터널 확인"])}
      ${node("ai", "외부 서비스 호출", ["Claude API — AI 해설·방명록 검사", "Gmail SMTP — 문의·방명록 알림"])}
    </div>
    <div class="inf-arrow" aria-hidden="true"><span>git push<br />/ 터널</span></div>
    <div class="inf-col">
      <h3>③ 공개 통로</h3>
      ${node("pub", "GitHub Pages", ["docs/ 폴더 = 공개 사이트", "화면 파일 + data.json", "forenus.github.io/real"])}
      ${node("pub", "Cloudflare 터널 <code>tunnel.js</code>", ["PC 서버를 https 로 공개", "주소는 실행마다 바뀜 → data.json 에 기록"])}
    </div>
    <div class="inf-arrow" aria-hidden="true"><span>HTTPS</span></div>
    <div class="inf-col">
      <h3>④ 이용자</h3>
      ${node("user", "PC·휴대폰 브라우저", ["data.json 으로 화면 표시", "터널로 실시간 요청: 수동 수집, 방명록·반응, 문의, 접속자, 통계"])}
      ${node("user", "홈 화면 앱", ["manifest.json · 아이콘"])}
    </div>
  </div>
  <p class="hint">PC가 꺼지면 공개 사이트는 마지막 게시 데이터로 계속 보이지만, 수동 수집·방명록·문의·접속자 같은 실시간 기능은 멈춥니다.</p>
</section>

<section class="card">
  <div class="table-head"><h2>기능별 한눈에 보기</h2><span class="dates">어떤 기술로 처리해 어디에 저장하는지</span></div>
  <div class="table-wrap"><table class="inf-table inf-feat">
    <thead><tr><th>기능 · 화면</th><th>처리 파일</th><th>쓰는 기술</th><th>저장</th><th class="num">주기</th></tr></thead>
    <tbody>${features}</tbody>
  </table></div>
  <p class="inf-legend"><span>저장 범위</span>${Object.keys(SCOPE).map((k) => tag(k)).join("")}</p>
</section>

<section class="card">
  <div class="table-head"><h2>저장 위치</h2><span class="dates">크기·수정 시각은 지금 PC 기준</span></div>
  <div class="table-wrap"><table class="inf-table">
    <thead><tr><th>파일</th><th>내용</th><th>공개 범위</th><th>바뀌는 때</th><th class="num">크기</th><th class="num">마지막 수정</th></tr></thead>
    <tbody>${files}</tbody>
  </table></div>
</section>

<section class="card">
  <div class="table-head"><h2>API 목록</h2><span class="dates">PC 에서 직접 연 요청(localhost)은 비밀번호 확인을 건너뜁니다</span></div>
  <div class="table-wrap"><table class="inf-table">
    <thead><tr><th>주소</th><th>방식</th><th>하는 일</th><th>권한</th></tr></thead>
    <tbody>${apis}</tbody>
  </table></div>
</section>

<div class="grid-2">
  <section class="card">
    <h2>기술 스택</h2>
    <dl class="inf-stack">${STACK.map(([k, v]) => `<dt>${esc(k)}</dt><dd><div class="inf-chips">${chips(v)}</div></dd>`).join("")}</dl>
    <h2 class="inf-sub">주기 작업</h2>
    <ul class="inf-jobs">${JOBS.map(([t, d]) => `<li><span class="inf-every">${esc(t)}</span><span>${esc(d)}</span></li>`).join("")}</ul>
  </section>
  <section class="card">
    <h2>보안</h2>
    <ul class="inf-sec">
      <li>비밀번호·API 키(secret.json, mail.json)는 .gitignore 로 GitHub 에 올리지 않습니다.</li>
      <li>수동 수집·접속 통계·동 입력·관리자 메뉴는 서버에서 비밀번호를 확인하고, 5번 틀리면 15분 동안 막습니다.</li>
      <li>방명록 비밀번호와 반응한 사람은 해시로만 저장하고, 작성자 IP 는 저장하지 않습니다.</li>
      <li>방명록 글은 저장 전에 AI 가 검사하고, 검사를 못 하면 저장하지 않습니다.</li>
      <li>공개 페이지 출처(github.io)에서 온 요청만 터널 API 를 쓸 수 있습니다(CORS).</li>
    </ul>
  </section>
</div>`;
}

module.exports = { render };
