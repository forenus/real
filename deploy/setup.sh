#!/usr/bin/env bash
# 매물 추적기 — 클라우드 리눅스 서버(Ubuntu 22.04/24.04) 설치 스크립트
# 내 PC 대신 이 서버가 30분 수집·게시, 방명록·문의·접속자 API, Cloudflare 터널을 맡는다.
#
# 사용법(서버에 SSH 로 접속한 뒤):
#   curl -fsSL https://raw.githubusercontent.com/forenus/real/main/deploy/setup.sh -o setup.sh
#   bash setup.sh
# 여러 번 실행해도 된다(이미 된 단계는 건너뛰거나 최신으로 맞춘다).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/real}"
REPO_SSH="git@github.com:forenus/real.git"
REPO_HTTPS="https://github.com/forenus/real.git"
NODE_MAJOR=24

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

say "1/7 시간대를 한국 시각으로"
sudo timedatectl set-timezone Asia/Seoul || true

# 메모리 1GB 서버(GCP e2-micro 등)는 Chromium 수집 중 메모리가 모자라므로 스왑 2GB 를 붙인다
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q /swapfile; then
  say "메모리가 작아 스왑 2GB 추가"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

say "2/7 기본 패키지·Node.js ${NODE_MAJOR}"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

say "3/7 cloudflared(터널)"
if ! command -v cloudflared >/dev/null; then
  ARCH="$(dpkg --print-architecture)"   # amd64 또는 arm64(Oracle Ampere)
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i /tmp/cloudflared.deb
fi
cloudflared --version

say "4/7 GitHub 게시용 배포 키"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
KEY="$HOME/.ssh/real_deploy"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "real-tracker-server" -f "$KEY" >/dev/null
fi
if ! grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null; then
  printf 'Host github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> "$HOME/.ssh/config"
  chmod 600 "$HOME/.ssh/config"
fi
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
if ! ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo
  echo "아래 공개키를 GitHub 저장소 → Settings → Deploy keys → Add deploy key 에 붙여 넣고"
  echo "'Allow write access' 를 꼭 체크한 뒤, 이 스크립트를 다시 실행하세요."
  echo "  https://github.com/forenus/real/settings/keys/new"
  echo "----------------------------------------------------------------"
  cat "$KEY.pub"
  echo "----------------------------------------------------------------"
  exit 0
fi

say "5/7 코드 받기·의존성 설치"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_HTTPS" "$APP_DIR"
fi
cd "$APP_DIR"
git remote set-url origin "$REPO_SSH"
git pull --ff-only origin main
git config user.name  >/dev/null || git config user.name  "real-tracker-server"
git config user.email >/dev/null || git config user.email "real-tracker-server@users.noreply.github.com"
npm ci --omit=dev
# 수집용 Chromium 과 리눅스 라이브러리
npx --yes playwright install --with-deps chromium

say "6/7 비밀값·데이터 확인"
missing=0
for f in secret.json mail.json; do
  if [ ! -f "$APP_DIR/$f" ]; then echo "  ⚠ $f 없음 — PC 에서 deploy/push-data.ps1 로 올려 주세요."; missing=1; fi
done

say "7/7 서비스 등록(부팅 시 자동 실행·꺼지면 재시작)"
sed -e "s#__USER__#$USER#g" -e "s#__DIR__#$APP_DIR#g" "$APP_DIR/deploy/real-server.service" | sudo tee /etc/systemd/system/real-server.service >/dev/null
sed -e "s#__USER__#$USER#g" -e "s#__DIR__#$APP_DIR#g" "$APP_DIR/deploy/real-tunnel.service" | sudo tee /etc/systemd/system/real-tunnel.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable real-server real-tunnel >/dev/null
if [ "$missing" = 1 ]; then
  echo "  비밀값을 올린 뒤:  sudo systemctl restart real-server real-tunnel"
else
  sudo systemctl restart real-server real-tunnel
  sleep 8
  systemctl --no-pager --lines=0 status real-server real-tunnel || true
  echo "  터널 주소: $(cat "$APP_DIR/tunnel-url.txt" 2>/dev/null || echo '(잠시 후 tunnel-url.txt 확인)')"
fi
echo
echo "완료. 로그 보기:  journalctl -u real-server -f"
