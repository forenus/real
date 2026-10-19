// Cloudflare Quick Tunnel(cloudflared)로 로컬 서버(5173)를 외부에 공개한다.
// 계정 없이 쓰는 대신 주소(https://<임의>.trycloudflare.com)가 실행할 때마다 바뀌므로,
// 새 주소를 tunnel-url.txt 에 적고 서버에 GitHub Pages 재게시를 요청해
// 공개 페이지의 '수동 수집' 버튼이 항상 현재 주소로 요청하게 한다.
// 끊기면(cloudflared 종료) 자동으로 다시 띄운다.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const PORT = 5173;
const LOG_FILE = path.join(__dirname, "tunnel.log");
const URL_FILE = path.join(__dirname, "tunnel-url.txt");
const CONFIG_FILE = path.join(__dirname, "config.json");
const CLOUDFLARED = process.env.CLOUDFLARED ||
  ["C:\\Program Files (x86)\\cloudflared\\cloudflared.exe", "C:\\Program Files\\cloudflared\\cloudflared.exe"]
    .find((p) => fs.existsSync(p)) || "cloudflared";

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function log(m) {
  const line = `[${ts()}] ${m}`;
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
  console.log(line);
}

process.on("uncaughtException", (e) => { log("uncaughtException: " + (e && e.stack || e)); });
process.on("unhandledRejection", (e) => { log("unhandledRejection: " + (e && e.stack || e)); });

// 새 주소를 공개 페이지(data.json 의 collectUrl)에 반영 — 로컬 서버의 /api/publish 호출
function requestPublish(tries = 0) {
  let auth = null;
  try { auth = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")).auth || null; } catch {}
  const headers = auth && auth.user ? { Authorization: "Basic " + Buffer.from(`${auth.user}:${auth.pass}`).toString("base64") } : {};
  const req = http.request({ host: "127.0.0.1", port: PORT, path: "/api/publish", method: "POST", headers }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => log(`공개 페이지 재게시 요청 → HTTP ${res.statusCode} ${b.slice(0, 120)}`));
  });
  req.on("error", (e) => {
    // 서버가 아직 안 떴으면 잠시 후 다시 시도
    if (tries < 10) setTimeout(() => requestPublish(tries + 1), 10000);
    else log("재게시 요청 실패: " + e.message);
  });
  req.end();
}

let retry = 0;
function scheduleRestart() {
  const delay = Math.min(30000, 2000 * Math.pow(2, retry++)); // 2s→4s→…최대 30s
  log(`재시작 예약: ${Math.round(delay / 1000)}초 후`);
  setTimeout(start, delay);
}

function start() {
  log(`cloudflared 실행 (port=${PORT})`);
  const cp = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { windowsHide: true });
  let found = false;
  const onData = (chunk) => {
    if (found) return;
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m) return;
    found = true;
    retry = 0;
    log(`터널 연결됨 → ${m[0]}`);
    fs.writeFileSync(URL_FILE, m[0], "utf8");
    requestPublish();
  };
  cp.stdout.on("data", onData);
  cp.stderr.on("data", onData); // cloudflared 는 로그(주소 포함)를 stderr 로 낸다
  cp.on("error", (e) => { log("cloudflared 실행 실패: " + e.message); });
  cp.on("close", (code) => {
    log(`cloudflared 종료됨 (code=${code})`);
    try { fs.unlinkSync(URL_FILE); } catch {}
    scheduleRestart();
  });
}

log("tunnel.js 시작");
start();
