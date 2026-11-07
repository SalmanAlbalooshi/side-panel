@echo off
rem Installs Side Panel for you only (no admin rights): copies it to your own Programs folder,
rem adds Start menu and desktop shortcuts, and starts it. Run it from the unzipped folder.
setlocal
set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\Programs\Side Panel"
echo Installing Side Panel to %DEST% ...
taskkill /IM "Side Panel.exe" /F >nul 2>&1
taskkill /IM PanelHost.exe /F >nul 2>&1
if not exist "%DEST%" mkdir "%DEST%"
robocopy "%SRC%." "%DEST%" /E /NFL /NDL /NJH /NJS /NP /XF Install.cmd >nul
if errorlevel 8 (echo Copying failed. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject WScript.Shell; foreach($p in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))){ $l=$s.CreateShortcut((Join-Path $p 'Side Panel.lnk')); $l.TargetPath=(Join-Path $env:LOCALAPPDATA 'Programs\Side Panel\Side Panel.exe'); $l.WorkingDirectory=(Join-Path $env:LOCALAPPDATA 'Programs\Side Panel'); $l.Save() }"
start "" "%DEST%\Side Panel.exe"
echo Done. Side Panel is in your Start menu and on your desktop.
timeout /t 4 >nul
