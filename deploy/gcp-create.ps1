# 매물 추적기 — Google Cloud 서버(VM) 만들기
# 무료 등급(Always Free) 조건: e2-micro 1대 · 미국 리전(us-west1/us-central1/us-east1) · 표준 디스크 30GB 이하.
# 서울 리전(asia-northeast3)은 무료가 아니다(e2-micro 월 약 1만 원 안팎) — -Seoul 로 고를 수 있다.
#
# 준비: Google Cloud SDK 설치 → gcloud auth login → 결제 계정이 연결된 프로젝트
#   https://cloud.google.com/sdk/docs/install
# 사용법:
#   powershell -ExecutionPolicy Bypass -File D:\ANTI\real\deploy\gcp-create.ps1 -Project 내프로젝트ID
#   (서울 리전)  ... -Project 내프로젝트ID -Seoul
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Name = "real-tracker",
  [switch]$Seoul
)
$ErrorActionPreference = "Stop"
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw "gcloud 가 없습니다. https://cloud.google.com/sdk/docs/install 에서 설치 후 'gcloud auth login' 을 먼저 하세요." }

$zone = if ($Seoul) { "asia-northeast3-a" } else { "us-west1-b" }   # 무료 리전 중 한국과 가장 가까운 오리건
gcloud config set project $Project | Out-Null
gcloud services enable compute.googleapis.com

Write-Host "VM 만들기: $Name ($zone, e2-micro, Ubuntu 24.04, 표준 디스크 30GB)"
gcloud compute instances create $Name `
  --zone=$zone --machine-type=e2-micro `
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud `
  --boot-disk-size=30GB --boot-disk-type=pd-standard `
  --labels=app=real-tracker
# 들어오는 포트는 열지 않는다 — 바깥 접속은 Cloudflare 터널(서버에서 밖으로 나가는 연결)로만 받는다.

Write-Host "`n서버에 설치 스크립트 실행(처음엔 GitHub 배포 키를 보여 주고 멈춘다)"
gcloud compute ssh $Name --zone=$zone --command "curl -fsSL https://raw.githubusercontent.com/forenus/real/main/deploy/setup.sh -o setup.sh && bash setup.sh"
Write-Host "`n위 공개키를 https://github.com/forenus/real/settings/keys/new 에 'Allow write access' 체크해 등록한 뒤:"
Write-Host "  gcloud compute ssh $Name --zone=$zone --command 'bash setup.sh'"
Write-Host "  (수집 시험) gcloud compute ssh $Name --zone=$zone --command 'cd real && node deploy/test-collect.js'"
Write-Host "이사:  powershell -ExecutionPolicy Bypass -File D:\ANTI\real\deploy\push-data.ps1 -Gcp $Name -Zone $zone"
