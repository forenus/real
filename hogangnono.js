// 호갱노노 실시간 방문자 — 단지 페이지가 스스로 부르는 /api/realtime/visitor 응답을 받아 온다.
// 이 API 는 페이지 스크립트가 만든 서명 헤더가 있어야 열리므로, 화면 없는 브라우저로 단지 페이지를 잠깐 연다.
// 결과는 hogangnono.json 에 보관한다(수집할 때마다 갱신).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FILE = path.join(__dirname, "hogangnono.json");

function loadHogangnono() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return null; }
}

// url: https://hogangnono.com/apt/{hash}[/거래유형/평형번호]
async function updateHogangnono(url) {
  const hash = (String(url || "").match(/\/apt\/([A-Za-z0-9]+)/) || [])[1];
  if (!hash) return null;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
    // 지도 타일·이미지 등은 필요 없으니 받지 않는다(빨리 끝나게)
    await page.route("**/*", (r) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const got = page.waitForResponse((r) => r.url().includes(`/api/realtime/visitor/apt/${hash}`) && r.status() === 200, { timeout: 30000 });
    await page.goto(`https://hogangnono.com/apt/${hash}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const j = await (await got).json();
    const d = (j && j.data) || {};
    if (typeof d.realtime !== "number") throw new Error("실시간 방문자 응답 형식이 바뀌었습니다.");
    const saved = {
      url: String(url), // 설정한 주소 그대로(평형까지 고른 주소 — 예: /apt/{hash}/0/1 은 33평)
      realtime: d.realtime,       // 지금 보는 중
      recent24h: d.recent24h,     // 최근 24시간 방문자
      frequent: d.frequent,       // 자주 방문하는 사람
      new: d.new,                 // 새로 방문한 사람
      fetchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(FILE, JSON.stringify(saved, null, 2), "utf8");
    return saved;
  } finally {
    await browser.close();
  }
}

// 호갱노노 실거래 — 네이버보다 먼저 반영되는 경우가 있어 최근 구간만 받아 네이버 목록에 보탠다.
// 평형별 월별 리포트도 서명 헤더가 필요해 평형마다 단지 페이지를 연다.
// areas: { 호갱노노 평형번호: 평 } (config.json 의 hogangnonoAreas)
async function fetchHogangnonoDeals(url, areas, days = 60) {
  const hash = (String(url || "").match(/\/apt\/([A-Za-z0-9]+)/) || [])[1];
  if (!hash || !areas) return [];
  const p2 = (n) => String(n).padStart(2, "0");
  const from = new Date(Date.now() - days * 86400000);
  const fromStr = `${from.getFullYear()}-${p2(from.getMonth() + 1)}-${p2(from.getDate())}`;
  const out = [];
  for (const [areaNo, pyeong] of Object.entries(areas)) {
    // 응답이 가끔 늦다 — 한 번 더 시도하고, 그래도 안 되면 이 평형만 건너뛴다
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        out.push(...(await fetchAreaDeals(hash, areaNo, Number(pyeong), fromStr)));
        break;
      } catch (e) {
        console.log(`  [호갱노노 실거래] ${pyeong}평 ${attempt}차 실패:`, e.message.split("\n")[0]);
      }
    }
  }
  return out;
}

async function fetchAreaDeals(hash, areaNo, pyeong, fromStr) {
  const p2 = (n) => String(n).padStart(2, "0");
  const browser = await chromium.launch(); // 평형마다 새 브라우저(한 브라우저로 이어 열면 멈추는 경우가 있다)
  try {
    const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
    await page.route("**/*", (r) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const got = page.waitForResponse((r) => r.url().includes(`/apts/${hash}/monthly-reports`) && r.url().includes(`tradeType=0&areaNo=${areaNo}`) && r.status() === 200, { timeout: 40000 });
    await page.goto(`https://hogangnono.com/apt/${hash}/0/${areaNo}`, { waitUntil: "commit", timeout: 30000 });
    const j = await (await got).json();
    const out = [];
    for (const mon of (j.data && j.data.shortTermReport) || []) {
      // 월 표시는 한국시간 1일 0시(UTC 전날 15시)로 온다
      const kst = new Date(new Date(mon.date).getTime() + 9 * 3600000);
      const ym = `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}`;
      for (const t of mon.trades || []) {
        const date = `${ym}-${p2(t.day)}`;
        if (!t.price || !t.day || date < fromStr) continue;
        out.push({ date, pyeong, floor: t.floor != null ? String(t.floor) : "", price: Number(t.price) });
      }
    }
    return out;
  } finally {
    browser.close().catch(() => {}); // 페이지가 로딩 중이면 닫는 데 수십 초 걸린다 — 기다리지 않는다
  }
}

// 호갱노노에만 있는 거래를 네이버 수집 결과에 보탠다(같은 날짜·평형·층·가격이면 같은 거래).
// realDeals·realDealsAll·realAvg 를 그 자리에서 고치고, 보탠 거래를 돌려준다.
function mergeHogangnonoDeals({ realDeals, realDealsAll, realAvg }, hgDeals, avgFrom) {
  if (!realDeals) return []; // 네이버 실거래 수집 실패 시에는 건드리지 않는다
  const key = (x) => `${x.date}|${x.pyeong}|${x.floor}|${x.price}`;
  const known = new Set(realDeals.concat(realDealsAll || []).map(key));
  const excl = {};
  for (const x of realDeals.concat(realDealsAll || [])) if (x.excl) excl[x.pyeong] = excl[x.pyeong] || x.excl;
  const added = [];
  for (const h of hgDeals) {
    if (known.has(key(h))) continue;
    known.add(key(h));
    const deal = { ...h, excl: excl[h.pyeong] || null, canceled: false, source: "hogangnono" };
    added.push(deal);
    realDeals.push(deal);
    if (realDealsAll) realDealsAll.push(deal);
    const a = (realAvg[h.pyeong] = realAvg[h.pyeong] || { price: null, count: 0, days: 10, max: null, min: null });
    if (h.date >= avgFrom) { a.price = ((a.price || 0) * a.count + h.price) / (a.count + 1); a.count += 1; }
    const ym = h.date.slice(0, 7).replace("-", ".");
    if (a.max && h.price > a.max.price) a.max = { price: h.price, ym };
    if (a.min && h.price < a.min.price) a.min = { price: h.price, ym };
  }
  if (added.length) {
    const byDate = (a, b) => b.date.localeCompare(a.date) || b.price - a.price;
    realDeals.sort(byDate);
    if (realDealsAll) realDealsAll.sort(byDate);
  }
  return added;
}

module.exports = { updateHogangnono, loadHogangnono, fetchHogangnonoDeals, mergeHogangnonoDeals };
