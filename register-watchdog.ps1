# 매물 추적기 감시 작업 등록 — 10분마다 start-hidden.vbs 를 실행해
# 서버(server.js)·터널(tunnel.js)이 꺼져 있으면 다시 띄운다(떠 있으면 아무것도 안 함).
# 실행: powershell -ExecutionPolicy Bypass -File D:\ANTI\real\register-watchdog.ps1
# 해제: Unregister-ScheduledTask -TaskName '매물추적기 감시' -Confirm:$false
$dir = $PSScriptRoot
$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$dir\start-hidden.vbs`"" -WorkingDirectory $dir
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 9999)
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName '매물추적기 감시' -Action $a -Trigger $t -Settings $s -Description "매물 추적기 서버/터널이 꺼져 있으면 다시 실행 ($dir\start-hidden.vbs)" -Force | Out-Null
# 로그인 시 실행되는 시작프로그램 사본도 최신 런처로 맞춘다
Copy-Item "$dir\start-hidden.vbs" (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\매물추적기.vbs') -Force
Get-ScheduledTask -TaskName '매물추적기 감시' | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
