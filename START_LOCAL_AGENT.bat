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

rem Brauzerni faqat Local Agent porti haqiqatan tayyor bo'lgandan keyin ochadi.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:3940/healthz'; for($i=0;$i -lt 120;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1; if($r.StatusCode -eq 200){ Start-Process 'http://127.0.0.1:3940'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process 'http://127.0.0.1:3940'"

echo ==============================================
echo   AutoMix Local Agent ishga tushmoqda...
echo   Panel: http://127.0.0.1:3940
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
