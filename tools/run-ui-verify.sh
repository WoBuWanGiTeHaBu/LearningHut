#!/usr/bin/env bash
# 启动真实 Electron 应用 + 立刻跑 UI 级验证（必须在同一条命令内完成，否则应用会被回收）
set -u

export PATH="/usr/bin:/bin:$PATH"
cd /e/AIProject/LearningHut || exit 1

ELECTRON="./node_modules/electron/dist/electron.exe"
export NODE_PATH="C:/Users/shengqi/.workbuddy/binaries/node/workspace/node_modules"
export NO_PROXY="localhost,127.0.0.1"
export no_proxy="localhost,127.0.0.1"
unset HTTP_PROXY http_proxy HTTPS_PROXY https_proxy ALL_PROXY all_proxy

# 清掉可能残留的实例
for pid in $(tasklist //FI "IMAGENAME eq electron.exe" //FO CSV //NH 2>/dev/null | awk -F'","' '{print $2}'); do
  taskkill //PID "$pid" //F >/dev/null 2>&1
done
sleep 1

rm -f tools/app-run.out tools/app-run.err
env -u ELECTRON_RUN_AS_NODE "$ELECTRON" . --remote-debugging-port=9222 > tools/app-run.out 2> tools/app-run.err &
APP_PID=$!
echo "app_pid=$APP_PID"

# 等 CDP 就绪
for i in $(seq 1 30); do
  if curl -s --noproxy '*' -o /dev/null http://127.0.0.1:9222/json/version; then break; fi
  sleep 1
done

node "${1:-tools/cdp-ui.cjs}" > tools/ui-report.txt 2>&1
echo "verify_exit=$?"

taskkill //PID "$APP_PID" //F >/dev/null 2>&1
# Electron 会留子进程，必须全清 —— 残留进程会锁住 data/learning-hut.db，
# 让下一轮的备份 / 恢复出现莫名其妙的失败（0 字节快照之类）
for pid in $(tasklist //FI "IMAGENAME eq electron.exe" //FO CSV //NH 2>/dev/null | awk -F'","' '{print $2}'); do
  taskkill //PID "$pid" //F >/dev/null 2>&1
done
echo "DONE"
