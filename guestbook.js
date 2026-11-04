// 방명록 — 글은 PC 의 guestbook.json 에만 저장한다(저장소·공개 페이지 data.json 에는 넣지 않는다).
// 공개 페이지는 터널(collectUrl)로 목록을 받아 간다. 지운 글이 GitHub 기록에 남지 않게 하려는 것.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = path.join(__dirname, "guestbook.json");
const MAX_KEEP = 1000;       // 파일에 남길 최대 글 수
const LIST_MAX = 200;        // 한 번에 돌려줄 글 수
const GAP_MS = 30 * 1000;    // 같은 곳에서 연달아 쓰지 못하게 하는 간격
const NAME_MAX = 20;
const TEXT_MAX = 500;

const lastPost = new Map(); // ip → 마지막 작성 시각

function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE, "utf8")); return Array.isArray(d) ? d : []; } catch { return []; }
}
function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list.slice(-MAX_KEEP), null, 2), "utf8");
}
const hash = (salt, pw) => crypto.createHash("sha256").update(salt + "|" + pw).digest("hex");
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 공개용 — 비밀번호·IP 해시는 빼고 최신 글부터
function list() {
  const all = load();
  return {
    total: all.length,
    list: all.slice(-LIST_MAX).reverse().map(({ id, name, text, at, hue }) => ({ id, name, text, at, hue })),
  };
}

function post(body, ip) {
  if (!body) return { code: 400, body: { error: "요청 형식이 올바르지 않습니다." } };
  if (body.website) return { code: 200, body: { ok: true, ...list() } }; // 스팸 봇용 숨은 칸
  const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, n);
  const name = clean(body.name, NAME_MAX).replace(/\s+/g, " ") || "익명";
  const text = clean(body.text, TEXT_MAX).replace(/\n{3,}/g, "\n\n");
  const pw = String(body.pw || "");
  if (!text) return { code: 400, body: { error: "내용을 입력해 주세요." } };
  if (pw.length < 4 || pw.length > 20) return { code: 400, body: { error: "삭제용 비밀번호를 4~20자로 입력해 주세요." } };
  const last = lastPost.get(ip) || 0;
  if (Date.now() - last < GAP_MS) {
    return { code: 429, body: { error: `방금 글을 남겼습니다. ${Math.ceil((GAP_MS - (Date.now() - last)) / 1000)}초 뒤에 다시 남겨 주세요.` } };
  }
  const id = crypto.randomBytes(6).toString("hex");
  const all = load();
  // 같은 곳에서 쓴 글은 같은 색 — IP 자체는 저장하지 않는다
  const hue = parseInt(crypto.createHash("sha256").update("gb|" + ip).digest("hex").slice(0, 4), 16) % 360;
  all.push({ id, name, text, at: new Date().toISOString(), hue, pw: hash(id, pw) });
  save(all);
  lastPost.set(ip, Date.now());
  return { code: 200, body: { ok: true, id, ...list() } };
}

// 글 비밀번호가 맞으면 지운다. 맞지 않으면 null — 관리자 확인은 server.js 가 한다.
function remove(id, pw, admin) {
  const all = load();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return { code: 404, body: { error: "이미 지워진 글입니다.", ...list() } };
  if (!admin && !sameHash(all[i].pw, hash(id, String(pw || "")))) return null;
  all.splice(i, 1);
  save(all);
  return { code: 200, body: { ok: true, ...list() } };
}

module.exports = { list, post, remove };
