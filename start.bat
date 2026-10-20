@echo off
rem ============================================
rem  Career tool - local launcher
rem  Double-click this file to start the web app.
rem  Close this window to stop the server.
rem ============================================
cd /d "%~dp0webapp"

where python >nul 2>nul
if not errorlevel 1 (
  set "PY=python"
  goto run
)
where py >nul 2>nul
if not errorlevel 1 (
  set "PY=py"
  goto run
)

echo Python not found. Opening index.html directly in the browser.
start "" "%~dp0webapp\index.html"
goto end

:run
echo Server starting: http://127.0.0.1:8080 (this PC only)
echo Close this window to stop the server.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8080"
%PY% -m http.server 8080 --bind 127.0.0.1

:end
