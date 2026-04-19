@echo off
cd /d "%~dp0"

echo Кто хочет стать миллионером

where pnpm >nul 2>nul
if errorlevel 1 (
  echo Нет pnpm. Установите Node.js 20+ с nodejs.org, потом:
  echo npm install -g pnpm
  pause
  exit /b 1
)

if not exist node_modules (
  echo Первый запуск, ставлю зависимости...
  call pnpm install
)

echo Запускаю сервер и клиент...
echo Для остановки нажмите Ctrl+C
call pnpm dev

pause
