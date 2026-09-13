@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env call SETUP.bat
findstr /b /c:"PANEL_PASSWORD=" .env | findstr /v /r "PANEL_PASSWORD=$" >nul
if errorlevel 1 (
  echo [XATO] Telefon/LAN rejimida PANEL_PASSWORD majburiy.
  echo .env faylida PANEL_PASSWORD=kuchli_parol yozing.
  start "" notepad.exe "%cd%\.env"
  pause
  exit /b 1
)
set HOST=0.0.0.0
echo Telefon/LAN rejimi yoqildi. Brauzerda dashboard ichidagi LAN manzilni oching.
node server.js
if errorlevel 1 pause
