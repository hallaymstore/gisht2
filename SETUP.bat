@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env copy /y .env.example .env >nul
powershell -NoProfile -Command "$p='.env'; $c=Get-Content $p -Raw; if($c -match 'APP_SECRET=CHANGE_ME'){ $s=([guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')); $c=$c -replace 'APP_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET_32_CHARS_OR_MORE',('APP_SECRET='+$s); Set-Content -Encoding UTF8 $p $c }"
echo.
echo .env tayyor. Google OAuth va (xohlasangiz) Gemini API key ni kiriting.
echo Fayl Notepad'da ochiladi.
start "" notepad.exe "%cd%\.env"
