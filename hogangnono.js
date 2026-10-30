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

module.exports = { updateHogangnono, loadHogangnono };
