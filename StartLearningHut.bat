@echo off
rem ============================================================
rem  学习小屋 (LearningHut) 启动器
rem  作用：清掉可能干扰 Electron 的环境变量 -> 杀掉旧实例 -> 启动最新构建
rem  用法：直接双击本文件
rem ============================================================
cd /d "%~dp0"

rem ELECTRON_RUN_AS_NODE 会让 Electron 退化成纯 Node 并在 app.setName 处崩溃。
rem 某些开发工具（IDE / AI 助手 / 测试框架）会在会话里注入它，这里在 cmd 进程内清干净，
rem 之后启动的 electron.exe 就会继承这份干净的环境。
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_NO_ATTACH_CONSOLE="
set "ELECTRON_FORCE_IS_PACKAGED="

rem 检查 Electron 是否已安装
if not exist "node_modules\electron\dist\electron.exe" (
  echo [错误] 找不到 Electron，请先在本目录执行： npm install
  pause
  exit /b 1
)

rem 检查是否已构建
if not exist "out\main\index.js" (
  echo [提示] 还没有构建产物，正在构建...
  call npx electron-vite build
  if errorlevel 1 (
    echo [错误] 构建失败
    pause
    exit /b 1
  )
)

rem 杀掉本项目的旧实例（只匹配当前项目路径，不影响其他 Electron 应用）
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains('%CD%'.ToLower()) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

rem 启动（用 start 让它脱离本窗口，关掉 cmd 不会带走应用）
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
