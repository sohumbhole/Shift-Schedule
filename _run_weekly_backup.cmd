@echo off
REM Manual entry point for the Supabase backup of ALL users into the local "Backups" folder.
REM All the logic lives in _run_weekly_backup.ps1 (keep awake, wait for network, retry, skip when
REM a backup from the last 6 days exists). Pass -Force to back up regardless.
REM The scheduled task "Supabase Weekly Backup" calls the .ps1 directly, hidden.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_run_weekly_backup.ps1" %*
exit /b %ERRORLEVEL%
