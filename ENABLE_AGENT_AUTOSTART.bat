@echo off
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\AutoMixLocalAgent.cmd"
>"%TARGET%" echo @echo off
>>"%TARGET%" echo cd /d "%~dp0"
>>"%TARGET%" echo start "AutoMix Local Agent" /min cmd /c ""%~dp0START_LOCAL_AGENT_SILENT.bat""
echo.
echo [OK] AutoMix Local Agent Windows Startup ga qo'shildi.
echo Kompyuterga kirganingizda agent avtomatik ishga tushadi.
echo Cloud navbatdagi buyruqlarni o'zi olib davom ettiradi.
pause
