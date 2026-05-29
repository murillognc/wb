@echo off
REM == Inicia o WaterBrain no Windows (serve o painel + API em :8000) ==
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] O Python nao foi encontrado.
  echo  Instale em https://www.python.org/downloads/  ^(marque "Add Python to PATH"^)
  echo.
  pause
  exit /b 1
)

if not exist .venv (
  echo Criando ambiente e instalando dependencias ^(so na primeira vez^)...
  python -m venv .venv
  call .venv\Scripts\python -m pip install --upgrade pip
  call .venv\Scripts\pip install -r requirements.txt
)

echo.
echo  WaterBrain rodando! Abra no navegador:  http://localhost:8000
echo  ^(para parar, feche esta janela ou aperte Ctrl+C^)
echo.
call .venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
