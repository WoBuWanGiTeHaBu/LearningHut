@echo off
rem ============================================================
rem  Study Helper —— 运行打包好的正式版（免安装绿色版）
rem  数据存在 exe 同级的 data\ 目录里，不占 C 盘。
rem  用法：直接双击本文件
rem ============================================================
cd /d "%~dp0"

if not exist "dist\win-unpacked\Study Helper.exe" (
  echo [提示] 还没有打包产物。
  echo.
  echo   请先在本目录执行打包命令：
  echo       npm run pack
  echo.
  echo   打包完成后会生成：
  echo       dist\Study-Helper-Setup-0.1.0.exe   （安装程序，可发给别人）
  echo       dist\Study-Helper-0.1.0-x64.zip     （免安装绿色版）
  echo.
  pause
  exit /b 1
)

rem 清掉可能干扰 Electron 的环境变量
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_NO_ATTACH_CONSOLE="
set "ELECTRON_FORCE_IS_PACKAGED="

start "" "dist\win-unpacked\Study Helper.exe"
exit /b 0
