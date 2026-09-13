@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules" exit /b 2
if not exist "local-agent\data" mkdir "local-agent\data" >nul 2>&1
:loop
echo [%date% %time%] AutoMix Local Agent starting...>>"local-agent\data\agent-service.log"
node local-agent\agent.js >>"local-agent\data\agent-service.log" 2>&1
echo [%date% %time%] Agent stopped. Restarting in 10 seconds...>>"local-agent\data\agent-service.log"
timeout /t 10 /nobreak >nul
goto loop
