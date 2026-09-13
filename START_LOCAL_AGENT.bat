@echo off
chcp 65001 >nul
title AutoMix Local Agent
cd /d "%~dp0"

if not exist "node_modules" (
  echo Node paketlari topilmadi. INSTALL_LOCAL_AGENT.bat ishga tushirilmoqda...
  call INSTALL_LOCAL_AGENT.bat
  if errorlevel 1 (
    echo.
    echo [XATO] Node paketlarini o'rnatib bo'lmadi.
    pause
    exit /b 1
  )
)

rem Agent haqiqatan HTTP javob bergandan keyin yangi URL ochiladi.
rem Query param Chrome eski ERR_CONNECTION_REFUSED tabini qayta ishlatib qolmasligi uchun.
start "AutoMix Panel Waiter" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "$health='http://127.0.0.1:3940/api/status'; for($i=0;$i -lt 120;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 1; if($r.StatusCode -eq 200){ $ts=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); Start-Process ('http://localhost:3940/?fresh='+$ts); exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process cmd.exe -ArgumentList '/k','echo [XATO] 3940 port 60 soniyada javob bermadi. DIAGNOSE_LOCAL_AGENT.bat ni ishga tushiring.'"

echo ==============================================
echo   AutoMix Local Agent ishga tushmoqda...
echo   Panel: http://localhost:3940
echo ==============================================
echo Bu oynani yopmang. Yopsangiz avtomatik ish to'xtaydi.
echo.
node local-agent\agent.js
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo [XATO] Local Agent %EXITCODE% kodi bilan to'xtadi.
  echo Yuqoridagi xato matnining rasmini yuboring.
) else (
  echo Agent to'xtadi.
)
pause
