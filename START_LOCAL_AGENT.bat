@echo off
chcp 65001 >nul
title AutoMix Local Agent
cd /d "%~dp0"
if not exist "node_modules" (
  echo Node paketlari topilmadi. INSTALL_LOCAL_AGENT.bat ishga tushirilmoqda...
  call INSTALL_LOCAL_AGENT.bat
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:3940"
echo ==============================================
echo   AutoMix Local Agent ishlayapti
echo   Panel: http://127.0.0.1:3940
echo ==============================================
echo Bu oynani yopmang. Yopsangiz avtomatik ish to'xtaydi.
echo.
node local-agent\agent.js
echo.
echo Agent to'xtadi.
pause
