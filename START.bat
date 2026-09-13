@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo node_modules topilmadi. INSTALL.bat ishga tushirilmoqda...
  call INSTALL.bat
)
if not exist .env call SETUP.bat
start "" http://localhost:3939
node server.js
if errorlevel 1 (
  echo.
  echo Server xato bilan to'xtadi.
  pause
)
