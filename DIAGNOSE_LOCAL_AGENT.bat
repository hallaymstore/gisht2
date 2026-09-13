@echo off
chcp 65001 >nul
title AutoMix Local Agent - Diagnostika
cd /d "%~dp0"

echo ==============================================
echo   AutoMix Local Agent - Diagnostika
echo ==============================================
echo.
echo [1] Node.js:
where node
node -v
echo.
echo [2] 3940 port holati:
netstat -ano | findstr :3940
echo.
echo [3] HTTP test (127.0.0.1):
curl.exe --max-time 5 -i http://127.0.0.1:3940/api/status
echo.
echo [4] HTTP test (localhost):
curl.exe --max-time 5 -i http://localhost:3940/api/status
echo.
echo [5] Node processlar:
tasklist | findstr /I node.exe
echo.
echo Agar yuqorida xato bo'lsa, shu oynaning rasmini yuboring.
pause
