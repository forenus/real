// 접속 통계 — 공개 페이지가 열릴 때(메뉴 이동 포함) 보내 오는 기록을 날짜별로 모은다.
// IP 등 개인정보는 저장하지 않는다. 방문자 구분은 브라우저가 만든 무작위 번호(vid)로만 한다.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "stats.json");
const KEEP_DAYS = 400;           // 날짜별 기록 보관 기간
const RECENT_MAX = 50;           // 최근 방문 기록 개수
const MAX_PV_PER_VISITOR = 300;  // 한 방문자가 하루에 셀 수 있는 최대 조회 수(새로고침 연타·장난 방지)
const VIEWS = ["dashboard", "news", "board", "guide"];

let data = null;
let saveTimer = null;
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { data = {}; }
  data.days = data.days || {};
  data.seen = data.seen || {};   // vid → 처음 온 날
  data.recent = data.recent || [];
  return data;
}
// 기록마다 파일을 쓰지 않고 잠깐 모았다가 한 번에 쓴다
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(FILE, JSON.stringify(data), "utf8"); } catch (e) { console.log("  [통계] 저장 실패:", e.message); }
  }, 5000);
}

const p2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// 유입 경로 — 앞 페이지 주소의 호스트를 알아보기 쉬운 이름으로
function refName(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return "직접 방문";
  if (/kakao/.test(h)) return "카카오톡";
  if (/naver/.test(h)) return "네이버";
  if (/daum/.test(h)) return "다음";
  if (/google/.test(h)) return "구글";
  if (/band\.us/.test(h)) return "밴드";
  if (/facebook|instagram|threads/.test(h)) return "SNS";
  if (/github\.io$/.test(h)) return "직접 방문";
  return h.slice(0, 40);
}

function record(body) {
  const d = load();
  const vid = String(body.vid || "");
  if (!/^[a-z0-9]{8,32}$/.test(vid)) return false;
  const view = VIEWS.includes(body.view) ? body.view : "dashboard";
  const now = new Date();
  const day = ymd(now);
  const t = (d.days[day] = d.days[day] || { pv: 0, v: {}, views: {}, hours: Array(24).fill(0), dev: { pc: 0, mobile: 0 }, refs: {} });
  if ((t.v[vid] || 0) >= MAX_PV_PER_VISITOR) return false;
  const firstToday = !t.v[vid];
  const newVisitor = !d.seen[vid];
  t.pv += 1;
  t.v[vid] = (t.v[vid] || 0) + 1;
  t.views[view] = (t.views[view] || 0) + 1;
  t.hours[now.getHours()] += 1;
  if (firstToday) {
    t.dev[body.mobile ? "mobile" : "pc"] += 1;
    const r = refName(body.ref);
    t.refs[r] = (t.refs[r] || 0) + 1;
  }
  if (newVisitor) d.seen[vid] = day;
  d.recent.unshift({ t: now.toISOString(), view, mobile: !!body.mobile, ref: firstToday ? refName(body.ref) : "", isNew: newVisitor, vid: vid.slice(0, 6) });
  d.recent.length = Math.min(d.recent.length, RECENT_MAX);
  // 오래된 날짜 정리
  const cut = ymd(new Date(now.getTime() - KEEP_DAYS * 86400000));
  for (const k of Object.keys(d.days)) if (k < cut) delete d.days[k];
  saveSoon();
  return true;
}

// 관리자 화면용 요약 — 최근 n일
function summary(n = 30) {
  const d = load();
  const now = new Date();
  const dates = [];
  for (let i = n - 1; i >= 0; i--) dates.push(ymd(new Date(now.getTime() - i * 86400000)));
  const day = (k) => d.days[k] || null;
  const uniq = (keys) => { const s = new Set(); for (const k of keys) { const x = day(k); if (x) for (const v of Object.keys(x.v)) s.add(v); } return s.size; };
  const sum = (keys, f) => keys.reduce((a, k) => a + (day(k) ? f(day(k)) : 0), 0);
  const merge = (keys, field) => {
    const out = {};
    for (const k of keys) { const x = day(k); if (x) for (const [name, c] of Object.entries(x[field])) out[name] = (out[name] || 0) + c; }
    return out;
  };
  const today = dates[dates.length - 1];
  const last7 = dates.slice(-7);
  const hours = Array(24).fill(0);
  for (const k of dates) { const x = day(k); if (x) x.hours.forEach((c, h) => (hours[h] += c)); }
  return {
    today: { visitors: uniq([today]), pv: sum([today], (x) => x.pv) },
    week: { visitors: uniq(last7), pv: sum(last7, (x) => x.pv) },
    month: { visitors: uniq(dates), pv: sum(dates, (x) => x.pv) },
    total: { visitors: Object.keys(d.seen).length, pv: Object.values(d.days).reduce((a, x) => a + x.pv, 0), since: Object.keys(d.days).sort()[0] || null },
    daily: dates.map((k) => ({ date: k, visitors: day(k) ? Object.keys(day(k).v).length : 0, pv: day(k) ? day(k).pv : 0 })),
    views: merge(dates, "views"),
    refs: merge(dates, "refs"),
    devices: merge(dates, "dev"),
    hours,
    recent: d.recent,
  };
}

module.exports = { record, summary };
