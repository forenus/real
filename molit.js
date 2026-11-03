// 국토교통부 실거래가 공개시스템 — 조건별 자료제공 CSV 를 받아 동별 실거래를 집계하는 데 쓴다.
// 네이버·호갱노노 실거래에는 동 정보가 없고, 이 자료에는 일부 거래에 동이 나온다(나머지는 "-").
// 결과는 molit-deals.json 에 보관한다(하루 한 번 갱신).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("playwright");

const FILE = path.join(__dirname, "molit-deals.json");
const PAGE_URL = "https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=";

function loadMolit() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return null; }
}

// 큰따옴표로 감싼 CSV 한 줄 → 칸 배열
const splitRow = (line) => line.replace(/^"|"$/g, "").split('","');

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.includes("단지명") && l.includes("거래금액"));
  if (hi < 0) throw new Error("CSV 형식이 바뀌었습니다.");
  const head = splitRow(lines[hi]);
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const c = { area: col("전용면적"), ym: col("계약년월"), day: col("계약일"), price: col("거래금액"), dong: col("동"), floor: col("층"), cancel: col("해제사유"), reg: col("등기일자") };
  if (Object.values(c).some((i) => i < 0)) throw new Error("CSV 칸 이름이 바뀌었습니다.");
  const deals = [];
  for (const line of lines.slice(hi + 1)) {
    const r = splitRow(line);
    if (r.length < head.length) continue;
    const price = Number(String(r[c.price]).replace(/,/g, ""));
    if (!price) continue;
    const ym = r[c.ym];
    deals.push({
      date: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-${String(r[c.day]).padStart(2, "0")}`,
      area: parseFloat(r[c.area]) || 0,
      price,
      dong: r[c.dong] && r[c.dong] !== "-" ? r[c.dong] : "",
      floor: r[c.floor],
      canceled: !!r[c.cancel] && r[c.cancel] !== "-",
      registered: !!r[c.reg] && r[c.reg] !== "-",
    });
  }
  return deals;
}

// 선택 칸에 목록이 채워지길 기다렸다 이름으로 고른다(앞 칸을 고르면 서버에서 목록을 받아 온다)
async function pick(page, sel, name) {
  for (let i = 0; i < 60; i++) {
    const options = await page.$$eval(`${sel} option`, (e) => e.map((o) => [o.value, o.textContent.trim()]));
    const hit = options.find(([v, t]) => v && t.includes(name));
    if (hit) return page.selectOption(sel, hit[0]);
    await page.waitForTimeout(250);
  }
  throw new Error(`공개시스템 목록에 '${name}' 없음`);
}

// where: { sido, sgg, emd, complex } (config.json 의 molit). 기본 조회 기간(최근 1년) 그대로 받는다.
async function updateMolit(where) {
  if (!where || !where.complex) return null;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: "ko-KR", acceptDownloads: true });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 40000 });
    await pick(page, "#srhSidoCd", where.sido);
    await pick(page, "#srhSggCd", where.sgg);
    await pick(page, "#srhEmdCd", where.emd);
    await pick(page, "#srhHsmpCd", where.complex);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.evaluate(() => fnCSVDown())]);
    const tmp = path.join(os.tmpdir(), `molit-${process.pid}.csv`);
    await dl.saveAs(tmp);
    const deals = parseCsv(new TextDecoder("euc-kr").decode(fs.readFileSync(tmp)));
    fs.rmSync(tmp, { force: true });
    const saved = { fetchedAt: new Date().toISOString(), deals };
    fs.writeFileSync(FILE, JSON.stringify(saved), "utf8");
    return saved;
  } finally {
    browser.close().catch(() => {});
  }
}

module.exports = { updateMolit, loadMolit };
