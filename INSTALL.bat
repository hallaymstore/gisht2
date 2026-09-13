@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo  AutoMix YouTube AI - INSTALL
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo [XATO] Node.js topilmadi.
  echo Node.js 20 yoki yangirog'ini o'rnating: https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set MAJOR=%%V
if %MAJOR% LSS 20 (
  echo [XATO] Node.js 20+ kerak. Hozirgi: 
  node -v
  pause
  exit /b 1
)
if not exist .env call SETUP.bat
call npm install
if errorlevel 1 (
  echo [XATO] npm install bajarilmadi.
  pause
  exit /b 1
)
call npm run check
if errorlevel 1 (
  echo [XATO] Kod tekshiruvida muammo bor.
  pause
  exit /b 1
)
echo.
echo [OK] O'rnatildi. START.bat ni ishga tushiring.
pause
