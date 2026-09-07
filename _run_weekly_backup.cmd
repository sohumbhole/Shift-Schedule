@echo off
REM Weekly full Supabase backup of ALL users -> local "Backups" folder.
REM Called by Windows Task Scheduler ("Supabase Weekly Backup"). Runs locally.

cd /d "C:\Users\sohum\Documents\Atomic Wings Shift Scedule Website\Shift-Schedule-Repo"
set "BACKUP_OUT_DIR=C:\Users\sohum\Documents\Atomic Wings Shift Scedule Website\Backups"

echo ==== %DATE% %TIME% : starting full backup ==== >> "%BACKUP_OUT_DIR%\backup-log.txt"
"C:\Program Files\nodejs\node.exe" _backup_user.mjs --all >> "%BACKUP_OUT_DIR%\backup-log.txt" 2>&1
echo ==== %DATE% %TIME% : exit code %ERRORLEVEL% ==== >> "%BACKUP_OUT_DIR%\backup-log.txt"
