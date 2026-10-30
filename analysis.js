// 그래프 추이 해설 — 매물 추이·실거래 가격추이를 Claude 가 2~3문장으로 풀어 쓴다.
// API 키가 없거나 호출이 실패하면 규칙 기반 문장으로 대신한다.
// 키: secret.json 의 anthropicApiKey (또는 환경변수 ANTHROPIC_API_KEY). 결과는 analysis.json 에 보관한다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk").default;

const ROOT = __dirname;
const FILE = path.join(ROOT, "analysis.json");
const SECRET_FILE = path.join(ROOT, "secret.json");
const MODEL = "claude-opus-5-5";

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function loadAnalysis() { return readJson(FILE, null); }

const fmtMan = (man) => {
  if (man == null) return null;
  const r = Math.round(man / 100) * 100;
  const eok = Math.floor(r / 10000), rest = r - eok * 10000;
  return eok ? `${eok}억${rest ? " " + rest.toLocaleString() : ""}` : `${rest.toLocaleString()}만`;
};
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ---------- 해설 재료(숫자 요약) ----------
// 그래프 전체를 보내지 않고, 판단에 필요한 변화량·고저점·최근 흐름만 추린다.
function buildFacts(state, allDeals) {
  const ch = state.chart || {};
  const est = new Set(ch.estimatedDates || []);
  const dates = ch.dates || [];
  const realIdx = dates.map((d, i) => (est.has(d) ? -1 : i)).filter((i) => i >= 0);
  const at = (s, back) => { const i = realIdx[realIdx.length - 1 - back]; return i == null ? null : s.data[i]; };
  const listing = (ch.series || []).map((s) => {
    const last30 = realIdx.slice(-30).map((i) => ({ d: dates[i], v: s.data[i] }));
    const min = last30.reduce((m, x) => (x.v < m.v ? x : m), last30[0] || { v: null });
    const max = last30.reduce((m, x) => (x.v > m.v ? x : m), last30[0] || { v: null });
    return {
      평형: `${s.pyeong}평`,
      오늘: at(s, 0),
      전일대비: at(s, 0) != null && at(s, 1) != null ? at(s, 0) - at(s, 1) : null,
      "7일전대비": at(s, 0) != null && at(s, 7) != null ? at(s, 0) - at(s, 7) : null,
      "30일전대비": at(s, 0) != null && at(s, 30) != null ? at(s, 0) - at(s, 30) : null,
      "30일최저": min && min.v != null ? `${min.v}건(${min.d})` : null,
      "30일최고": max && max.v != null ? `${max.v}건(${max.d})` : null,
      "주간흐름(최근12주)": realIdx.filter((_, k) => (realIdx.length - 1 - k) % 7 === 0).slice(-12).map((i) => s.data[i]),
    };
  });

  const today = state.todayDate || new Date().toISOString().slice(0, 10);
  const deals = (allDeals || []).filter((x) => !x.canceled);
  const rc = state.realChart || {};
  const real = (rc.series || []).filter((s) => !s.compare).map((s) => {
    const p = s.pyeong;
    const mine = deals.filter((x) => x.pyeong === p);
    const within = (from, to) => mine.filter((x) => { const d = dayDiff(x.date, today); return d >= from && d < to; });
    const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x.price, 0) / xs.length : null);
    const r30 = within(0, 30), p30 = within(30, 60), y1 = within(335, 395);
    const high = mine.reduce((m, x) => (!m || x.price > m.price ? x : m), null);
    return {
      평형: `${p}평`,
      최근30일: { 건수: r30.length, 평균: fmtMan(avg(r30)), 평균만원: avg(r30) && Math.round(avg(r30)) },
      "그전30일(30~60일전)": { 건수: p30.length, 평균: fmtMan(avg(p30)), 평균만원: avg(p30) && Math.round(avg(p30)) },
      "1년전무렵": { 건수: y1.length, 평균: fmtMan(avg(y1)) },
      역대최고: high ? `${fmtMan(high.price)}(${high.date}, ${high.floor}층)` : null,
      최근거래: mine.slice(0, 10).map((x) => `${x.date} ${x.floor}층 ${fmtMan(x.price)}`),
    };
  });
  const compare = (rc.series || []).filter((s) => s.compare).map((s) => {
    const vals = s.data.filter((v) => v != null);
    return { 단지: s.complex, 평형: `${s.pyeong}평`, 최근이동평균: fmtMan(vals[vals.length - 1]) };
  });
  const asking = (state.rows || []).map((r) => ({ 평형: `${r.pyeong}평`, 평균호가: r.avgPrice || null, 최근10일실거래평균: r.realPrice || null }));
  return { 단지: state.complexName, 기준일: today, 매물수: listing, 호가: asking, 실거래: real, 비교단지: compare };
}

// ---------- 규칙 기반 해설(키가 없거나 실패할 때) ----------
const signed = (n) => (n > 0 ? `${n}건 늘었습니다` : n < 0 ? `${-n}건 줄었습니다` : "변동이 없습니다");
function ruleText(f) {
  const main = [...f.매물수].sort((a, b) => (b.오늘 || 0) - (a.오늘 || 0));
  const listing = main.map((x) => {
    let s = `${x.평형} 매물은 ${x.오늘}건으로 7일 전보다 ${signed(x["7일전대비"] || 0)}`;
    if (x["30일전대비"] != null) s += `(30일 전 대비 ${x["30일전대비"] > 0 ? "+" : ""}${x["30일전대비"]}건)`;
    return s + ".";
  }).join(" ") + (main[0] ? ` 최근 30일 ${main[0].평형} 범위는 ${main[0]["30일최저"]}~${main[0]["30일최고"]}입니다.` : "");
  const real = f.실거래.map((x) => {
    const a = x.최근30일, b = x["그전30일(30~60일전)"];
    let s = a.건수 ? `${x.평형}은 최근 30일 ${a.건수}건 거래됐고 평균 ${a.평균}입니다` : `${x.평형}은 최근 30일 거래가 없었습니다`;
    if (a.평균만원 && b.평균만원) {
      const d = a.평균만원 - b.평균만원;
      s += Math.abs(d) < 100 ? `(그전 30일과 비슷)` : `(그전 30일 평균보다 ${fmtMan(Math.abs(d))} ${d > 0 ? "높음" : "낮음"})`;
    }
    if (x.역대최고) s += `. 역대 최고가는 ${x.역대최고}입니다`;
    return s + ".";
  }).join(" ");
  return { listing, real };
}

// ---------- Claude 해설 ----------
function apiKey() {
  return (readJson(SECRET_FILE, {}) || {}).anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
}
const SYSTEM = `당신은 아파트 단지 데이터를 소유주에게 풀어 설명하는 부동산 데이터 해설가입니다.
주어진 숫자 요약만 근거로, 대시보드 그래프 아래에 붙일 짧은 해설을 씁니다.
- listing: 매물 수 추이 해설. real: 실거래 가격 추이 해설. 각각 한국어 2~3문장.
- 숫자(건수, 가격, 날짜)를 근거로 들고, 흐름(증가·감소·횡보)과 눈에 띄는 변화를 짚습니다.
- 매물 증가는 매도 물량이 쌓이는 신호, 감소는 소진·거래 신호로 해석할 수 있지만 단정하지 말고 "~로 보입니다" 정도로 씁니다.
- 거래가 적으면 평균이 크게 흔들릴 수 있다는 점을 필요할 때만 짚습니다.
- 매수·매도 권유, 가격 예측, 데이터에 없는 외부 요인 추측은 하지 않습니다.
- 존댓말(~습니다)로, 군더더기 없이 씁니다.`;
const SCHEMA = {
  type: "object",
  properties: { listing: { type: "string" }, real: { type: "string" } },
  required: ["listing", "real"],
  additionalProperties: false,
};
async function claudeText(facts, key) {
  const client = new Anthropic({ apiKey: key, timeout: 120000 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌린다
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `다음 데이터로 해설을 써 주세요.\n${JSON.stringify(facts)}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("해설 생성이 거절되었습니다.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  if (!out.listing || !out.real) throw new Error("해설 형식이 올바르지 않습니다.");
  return out;
}

// 수집할 때마다(자동 30분 간격·수동) 새로 분석한다. 키가 없을 때만 숫자가 같으면 이전 자동 문장을 그대로 쓴다.
async function updateAnalysis(state, allDeals, { force = false } = {}) {
  const facts = buildFacts(state, allDeals);
  const key = crypto.createHash("sha1").update(JSON.stringify(facts)).digest("hex");
  const prev = loadAnalysis();
  if (!force && prev && prev.key === key && !apiKey()) return prev;

  let result = null;
  const k = apiKey();
  if (k) {
    try { result = { ...(await claudeText(facts, k)), source: "ai" }; }
    catch (e) { console.log("  [해설] Claude 호출 실패 — 자동 분석으로 대신합니다:", e.message); }
  }
  if (!result) result = { ...ruleText(facts), source: "rule" };
  const saved = { ...result, key, date: facts.기준일, generatedAt: new Date().toISOString() };
  fs.writeFileSync(FILE, JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

module.exports = { updateAnalysis, loadAnalysis, buildFacts, ruleText };
