// 서버에서 네이버 수집이 되는지 한 번만 시험한다(저장·게시 없음).
// 사용법: cd ~/real && node deploy/test-collect.js
const path = require("path");
const { fetchSaleListings } = require(path.join(__dirname, "..", "naver"));
const { complexNo } = require(path.join(__dirname, "..", "config.json"));

(async () => {
  const t = Date.now();
  try {
    const articles = await fetchSaleListings(complexNo);
    const n = Array.isArray(articles) ? articles.length : (articles && articles.length) || 0;
    console.log(n > 0 ? `✅ 수집 성공 — 매매 매물 ${n}건 (${Math.round((Date.now() - t) / 1000)}초)` : "⚠ 응답은 왔지만 매물이 0건입니다. 차단됐을 수 있습니다.");
    process.exit(n > 0 ? 0 : 2);
  } catch (e) {
    console.log("❌ 수집 실패:", e.message);
    process.exit(1);
  }
})();
