@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==============================================
echo  PAINEL DE BORDO - MARINETRAFFIC WEBVIEW
 echo ==============================================
echo.
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 goto :erro
)
call npm run desktop
if errorlevel 1 goto :erro
goto :fim
:erro
echo.
echo O aplicativo nao conseguiu iniciar.
echo Verifique se o Node.js esta instalado e tente novamente.
pause
:fim
endlocal
