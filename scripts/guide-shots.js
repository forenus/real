// 사용법 화면에 넣을 참고 캡처를 만든다 — 서버(localhost:5173)가 켜진 상태에서 `node scripts/guide-shots.js`
// 결과: guide/*.jpg (공개 페이지 게시 때 docs/guide 로 복사된다)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "guide");
const BASE = "http://localhost:5173/";
fs.mkdirSync(OUT, { recursive: true });
const jpg = (name) => ({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 86 });

// 공개 페이지와 같은 모습으로 맞춘다(설정 메뉴 숨김, 버튼 이름) + 고정 상단 바가 캡처를 가리지 않게
async function open(browser, hash, viewport = { width: 1440, height: 900 }, mobile = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1.5, isMobile: mobile });
  await page.goto(BASE + "#" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: ".page-head{position:static!important} .status{display:none!important} .view{animation:none!important}" });
  await page.evaluate(() => {
    document.getElementById("nav-settings").hidden = true;
    document.getElementById("refresh-label").textContent = "지금 수동 수집";
    try { localStorage.setItem("showCompare", "1"); } catch {}
  });
  return page;
}
async function hover(page, sel, fx) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5);
  await page.waitForTimeout(300);
}
// 긴 요소는 위쪽 일부만 — 문서 좌표(스크롤 포함)로 잘라 찍는다
async function shotTop(page, sel, name, maxH) {
  const r = await page.locator(sel).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; });
  await page.screenshot({ ...jpg(name), clip: { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, maxH) }, fullPage: true });
}

(async () => {
  // 브라우저 하나에 페이지를 여러 개 열면 두 번째 페이지가 멈추는 일이 있어 화면마다 새로 띄운다
  const run = async (fn) => { const b = await chromium.launch(); try { await fn(b); } finally { await b.close(); } };

  await run(async (b) => {
    const p = await open(b, "dashboard");
    await p.screenshot({ ...jpg("overview"), clip: { x: 0, y: 0, width: 1440, height: 900 } });
    await p.locator("#kpis").screenshot(jpg("kpis"));
    await p.evaluate(() => document.getElementById("cmp-check").checked || document.getElementById("cmp-check").click());
    await hover(p, "#chart-wrap svg", 0.72);
    await p.locator(".charts > .card").nth(0).screenshot(jpg("chart-listing"));
    await hover(p, "#real-wrap svg", 0.86);
    await p.locator(".charts > .card").nth(1).screenshot(jpg("chart-real"));
    await p.mouse.move(0, 0);
    await p.locator("section.card:has(#table)").screenshot(jpg("table"));
    await shotTop(p, "#deals", "deals", 760);
    await p.locator("#deals-more").screenshot(jpg("deals-more"));
    // 매물 목록 / 증감 팝업
    await p.locator(".cnt-btn").last().click();
    await p.waitForTimeout(600);
    await p.locator(".modal-box").screenshot(jpg("modal-list"));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    await p.locator(".delta-btn").last().click();
    await p.waitForTimeout(600);
    await p.locator(".modal-box").screenshot(jpg("modal-changes"));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    // 수동 수집 로그인 창
    await p.evaluate(() => { askPassword(); });
    await p.waitForTimeout(400);
    await p.locator(".modal-box").screenshot(jpg("login"));
    await p.keyboard.press("Escape");
    await p.locator(".side-foot").screenshot(jpg("refresh-btn"));
    await p.evaluate(() => { try { localStorage.setItem("showCompare", "0"); } catch {} });
  });
  await run(async (b) => {
    const p = await open(b, "news");
    await shotTop(p, '.view[data-view="news"] .grid-2', "news", 620);
  });
  await run(async (b) => {
    const p = await open(b, "board");
    await p.locator(".card.contact").screenshot(jpg("board"));
  });
  await run(async (b) => {
    const p = await open(b, "dashboard", { width: 390, height: 844 }, true);
    await p.screenshot({ ...jpg("mobile"), clip: { x: 0, y: 0, width: 390, height: 844 } });
  });
  console.log("guide/ 에 캡처를 저장했습니다:", fs.readdirSync(OUT).join(", "));
})();
