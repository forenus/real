// 홈 화면 아이콘 생성 — 포레너스 로고 마크를 벡터로 그려 크기별 PNG 로 저장한다.
// 안드로이드는 아이콘 가장자리를 잘라내므로 마크를 가운데 안전 영역(약 60%) 안에 둔다.
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SIZES = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512 };
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" style="display:block">
  <rect width="512" height="512" fill="#fff"/>
  <g transform="translate(106 106)">
    <path fill="#0b2a52" d="M0 0H300V104H104V300H0Z"/>
    <rect x="134" y="114" width="166" height="84" fill="#46291a"/>
    <rect x="134" y="216" width="166" height="84" fill="#46291a"/>
  </g>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [file, size] of Object.entries(SIZES)) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(`<!doctype html><body style="margin:0">${MARK}</body>`);
      await page.screenshot({ path: path.join(ROOT, file) });
      await page.close();
      console.log(file, size);
    }
  } finally {
    await browser.close();
  }
})();
