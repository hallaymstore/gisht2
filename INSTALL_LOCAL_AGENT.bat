@echo off
chcp 65001 >nul
title AutoMix Local Agent - Install
cd /d "%~dp0"
echo ==============================================
echo   AutoMix Local Agent - o'rnatish
echo ==============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [XATO] Node.js topilmadi.
  echo Node.js 20 yoki undan yangi versiyani o'rnating: https://nodejs.org/
  pause
  exit /b 1
)
echo Node: 
node -v
echo.
echo Paketlar o'rnatilmoqda...
call npm install
if errorlevel 1 (
  echo [XATO] npm install muvaffaqiyatsiz.
  pause
  exit /b 1
)
if not exist "local-agent\data" mkdir "local-agent\data"
echo.
echo [OK] Local Agent tayyor.
echo Endi START_LOCAL_AGENT.bat ni ishga tushiring.
pause
