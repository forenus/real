// 관리자 메뉴 — 사이트 인프라 구성도. 관리자 비밀번호를 맞춘 요청에만 server.js 가 이 HTML 을 돌려준다.
// 공개 페이지(docs/)에는 복사되지 않는다. 파일 크기·수정 시각은 요청할 때마다 실제 값으로 채운다.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
// 리눅스(클라우드 서버)에서 돌면 구성도의 "내 PC" 표기를 서버 기준으로 바꾼다
const CLOUD = process.platform === "linux";
const HOST = CLOUD ? "서버" : "PC";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function fileInfo(name) {
  try {
    const st = fs.statSync(path.join(ROOT, name));
    const kb = st.size / 1024;
    return {
      ok: true,
      size: kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(kb))}KB`,
      at: st.mtime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }),
    };
  } catch { return { ok: false }; }
}

// 저장 파일 — [파일, 내용, 공개 여부, 쓰는 곳]
const STORES = [
  ["history.json", "날짜별 매물 스냅샷·실거래 원본", "비공개(PC)", "30분 수집"],
  ["docs/data.json", "공개 페이지용 요약 데이터", "공개(GitHub)", "게시할 때"],
  ["hogangnono.json", "호갱노노 방문자 수", "비공개(PC)", "3분마다"],
  ["molit-deals.json", "국토교통부 실거래(동 포함)", "비공개(PC)", "하루 1회"],
  ["dong-overrides.json", "관리자가 입력한 실거래 동", "비공개(PC)", "동 입력할 때"],
  ["analysis.json", "AI 해설 결과", "비공개(PC)", "수집할 때"],
  ["guestbook.json", "방명록 글·댓글", "비공개(PC)", "글 쓸 때"],
  ["stats.json", "방문 기록·접속 통계", "비공개(PC)", "방문할 때"],
  ["config.json", "단지 번호·호갱노노 주소 등 설정", "공개(GitHub)", "설정 저장"],
  ["secret.json", "비밀번호·Claude API 키", "비밀(PC만)", "수동 편집"],
  ["mail.json", "Gmail 발송 계정", "비밀(PC만)", "수동 편집"],
  ["tunnel-url.txt", "현재 터널 주소", "비공개(PC)", "터널 시작"],
];

// 기능별 처리 — [기능, 화면에서, 처리하는 곳, 저장]
const FLOWS = [
  ["매물 수집", "30분 자동 · 수동 수집 버튼", "server.js → naver.js (Playwright 브라우저)", "history.json"],
  ["실거래", "대시보드 실거래 목록·그래프", "네이버 + 호갱노노 합치기, 국토부로 동 보강", "history.json · molit-deals.json"],
  ["동별 분석", "동별 분석 메뉴", "server.js buildState (매물+실거래 동별 집계)", "dong-overrides.json"],
  ["AI 해설", "그래프 아래 해설", "analysis.js → Claude Opus 5.5", "analysis.json"],
  ["지역 소식", "지역 소식 메뉴", "news.js → Google 뉴스 RSS", "저장 안 함(요청 시)"],
  ["방명록", "방명록 메뉴", "guestbook.js → Claude Haiku 5.5 검사", "guestbook.json + 메일 알림"],
  ["개선·문의", "개선·문의 메뉴", "server.js → nodemailer(Gmail SMTP)", "저장 안 함(메일만)"],
  ["현재 접속자", "좌측 접속자 목록", "20초마다 신호(/api/presence)", "메모리(저장 안 함)"],
  ["접속 통계", "접속 통계 메뉴(관리자)", "stats.js", "stats.json"],
];

const JOBS = [
  ["30분", "네이버 매물 수집 → 호갱노노 실거래 → 국토부(하루 1회) → AI 해설 → GitHub 게시"],
  ["3분", "호갱노노 실시간 방문자 수(게시 없이 접속자 응답으로 전달)"],
  ["20초", "열린 화면이 현재 접속자 신호를 보냄"],
  CLOUD ? ["상시", "systemd 서비스 real-server · real-tunnel — 꺼지면 10초 뒤 자동 재시작, 부팅 시 자동 실행"]
    : ["10분", "Windows 작업 스케줄러 '매물추적기 감시' — 서버·터널이 꺼져 있으면 다시 실행"],
];

const node = (cls, title, items) =>
  `<div class="inf-node ${cls}"><b>${title}</b>${items ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}</div>`;

function render() {
  const files = STORES.map(([f, what, scope0, when]) => {
    const scope = scope0.replace("PC", HOST);
    const i = fileInfo(f);
    const cls = scope.startsWith("비밀") ? "secret" : scope.startsWith("공개") ? "public" : "private";
    return `<tr><td><code>${esc(f)}</code></td><td>${esc(what)}</td><td><span class="inf-tag ${cls}">${esc(scope)}</span></td>` +
      `<td>${esc(when)}</td><td class="num">${i.ok ? esc(i.size) : "없음"}</td><td class="num">${i.ok ? esc(i.at) : "–"}</td></tr>`;
  }).join("");

  return `
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
      <h3>② ${CLOUD ? "클라우드 서버 (Ubuntu)" : "내 PC (수집 서버)"}</h3>
      ${node("pc", "Node.js 서버 <code>server.js</code> :5173", ["30분 자동 수집·게시", "API 제공(수집·방명록·통계 등)"])}
      ${node("pc store", "로컬 저장 (JSON 파일)", ["history · guestbook · stats 등", "비밀값: secret · mail"])}
      ${CLOUD ? node("pc", "systemd 서비스", ["꺼지면 자동 재시작 · 부팅 시 실행"]) : node("pc", "감시 작업 (작업 스케줄러)", ["10분마다 서버·터널 확인"])}
      ${node("ai", "외부 서비스 호출", ["Claude API — AI 해설·방명록 검사", "Gmail SMTP — 문의·방명록 알림"])}
    </div>
    <div class="inf-arrow" aria-hidden="true"><span>git push<br />/ 터널</span></div>
    <div class="inf-col">
      <h3>③ 공개 통로</h3>
      ${node("pub", "GitHub Pages", ["docs/ 폴더 = 공개 사이트", "화면 파일 + data.json", "forenus.github.io/real"])}
      ${node("pub", "Cloudflare 터널 <code>tunnel.js</code>", [`${HOST} 서버를 https 로 공개`, "주소는 실행마다 바뀜 → data.json 에 기록"])}
    </div>
    <div class="inf-arrow" aria-hidden="true"><span>HTTPS</span></div>
    <div class="inf-col">
      <h3>④ 이용자</h3>
      ${node("user", "PC·휴대폰 브라우저", ["data.json 으로 화면 표시", "터널로 실시간 요청: 수동 수집, 방명록, 문의, 접속자, 통계"])}
      ${node("user", "홈 화면 앱", ["manifest.json · 아이콘"])}
    </div>
  </div>
  ${CLOUD ? `<p class="hint">서버가 24시간 켜져 있어 PC를 꺼도 수집·방명록·문의·접속자 기능이 계속 동작합니다.</p>` : `<p class="hint">PC가 꺼지면 공개 사이트는 마지막 게시 데이터로 계속 보이지만, 수동 수집·방명록·문의·접속자 같은 실시간 기능은 멈춥니다.</p>`}
</section>

<section class="card">
  <div class="table-head"><h2>저장 위치</h2><span class="dates">크기·수정 시각은 지금 ${HOST} 기준</span></div>
  <div class="table-wrap"><table class="inf-table">
    <thead><tr><th>파일</th><th>내용</th><th>공개 범위</th><th>바뀌는 때</th><th class="num">크기</th><th class="num">마지막 수정</th></tr></thead>
    <tbody>${files}</tbody>
  </table></div>
</section>

<div class="grid-2">
  <section class="card">
    <h2>기능별 처리</h2>
    <div class="table-wrap"><table class="inf-table">
      <thead><tr><th>기능</th><th>처리</th><th>저장</th></tr></thead>
      <tbody>${FLOWS.map(([f, ui, how, st]) => `<tr><td><b>${esc(f)}</b><small>${esc(ui)}</small></td><td>${esc(how)}</td><td>${esc(st)}</td></tr>`).join("")}</tbody>
    </table></div>
  </section>
  <section class="card">
    <h2>주기 작업</h2>
    <ul class="inf-jobs">${JOBS.map(([t, d]) => `<li><span class="inf-every">${esc(t)}</span><span>${esc(d)}</span></li>`).join("")}</ul>
    <h2 class="inf-sub">보안</h2>
    <ul class="inf-sec">
      <li>비밀번호·API 키(secret.json, mail.json)는 .gitignore 로 GitHub 에 올리지 않습니다.</li>
      <li>수동 수집·접속 통계·동 입력·관리자 메뉴는 서버에서 비밀번호를 확인하고, 5번 틀리면 15분 동안 막습니다.</li>
      <li>방명록 비밀번호는 해시로만 저장하고, 작성자 IP 는 저장하지 않습니다.</li>
      <li>공개 페이지 출처(github.io)에서 온 요청만 터널 API 를 쓸 수 있습니다(CORS).</li>
    </ul>
  </section>
</div>`;
}

module.exports = { render };
