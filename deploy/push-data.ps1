# 매물 추적기 — 내 PC 의 데이터·비밀값을 클라우드 서버로 옮기고 PC 쪽 서버를 끈다(한 번만 실행).
# 사용법:
#   powershell -ExecutionPolicy Bypass -File D:\ANTI\real\deploy\push-data.ps1 -Server ubuntu@서버IP [-Key C:\경로\키.key]
# 순서: PC 서버·터널·감시 작업을 먼저 멈춘다 → 파일을 올린다 → 클라우드 서버를 다시 시작한다.
# (PC 와 서버가 동시에 돌면 방명록이 둘로 갈리고 게시 커밋이 서로 부딪친다.)
param(
  [Parameter(Mandatory = $true)][string]$Server,   # 예: ubuntu@123.45.67.89
  [string]$Key = "",                                # SSH 개인키 경로(필요할 때만)
  [string]$RemoteDir = "real"                       # 서버 홈 아래 설치 폴더
)
$ErrorActionPreference = "Stop"
$dir = Split-Path $PSScriptRoot -Parent
$sshArgs = @(); if ($Key) { $sshArgs = @("-i", $Key) }

# git 에 올리지 않는 파일들(데이터·비밀값)
$files = @("secret.json", "mail.json", "guestbook.json", "history.json", "stats.json", "analysis.json",
           "hogangnono.json", "molit-deals.json", "dong-overrides.json", "viewer/history.json") |
         Where-Object { Test-Path (Join-Path $dir $_) }

Write-Host "1) PC 서버·터널·감시 작업 멈춤"
try { Unregister-ScheduledTask -TaskName '매물추적기 감시' -Confirm:$false -ErrorAction Stop; Write-Host "   감시 작업 해제" } catch { Write-Host "   감시 작업 없음" }
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\매물추적기.vbs'
if (Test-Path $startup) { Rename-Item $startup "$startup.off" -Force; Write-Host "   시작프로그램 끔(매물추적기.vbs.off)" }
$pattern = [regex]::Escape($dir) + '\\(server|tunnel)\.js'
$ours = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match $pattern })
# tunnel.js 가 띄운 cloudflared 만 함께 끈다(다른 프로젝트의 터널은 건드리지 않는다)
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $ours.ProcessId -contains $_.ParentProcessId } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$ours | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "   종료: $($_.CommandLine)" }

Write-Host "2) 파일 올리기 → ${Server}:~/$RemoteDir"
& ssh @sshArgs $Server "mkdir -p ~/$RemoteDir/viewer"
foreach ($f in $files) {
  & scp @sshArgs (Join-Path $dir $f) "${Server}:~/$RemoteDir/$f"
  if ($LASTEXITCODE -ne 0) { throw "올리기 실패: $f" }
  Write-Host "   $f"
}
& ssh @sshArgs $Server "chmod 600 ~/$RemoteDir/secret.json ~/$RemoteDir/mail.json 2>/dev/null; true"

Write-Host "3) 클라우드 서버 재시작"
& ssh @sshArgs $Server "sudo systemctl restart real-server real-tunnel && sleep 10 && systemctl is-active real-server real-tunnel && cat ~/$RemoteDir/tunnel-url.txt"
Write-Host "`n완료. 이제 PC 를 꺼도 됩니다. 되돌리려면 PC 에서 register-watchdog.ps1 을 다시 실행하고 서버를 멈추세요."
