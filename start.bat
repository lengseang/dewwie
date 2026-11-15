@echo off
title Dewwie Desktop Software
cd /d "%~dp0"
echo ========================================================
echo    Dewwie - Autonomous AI Agent IDE & Terminal
echo ========================================================
echo.
if exist "%~dp0dewwie.exe" (
    "%~dp0dewwie.exe"
) else (
    echo Error: dewwie.exe not found in %~dp0
    pause
)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Dewwie exited with error code %ERRORLEVEL%.
    pause
)
