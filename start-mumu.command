#!/bin/zsh
# Start the private local app without placing credentials in command arguments.
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '需要先安装 Node.js 22 或更高版本，再启动木木。'
  read -r '?按回车关闭。'
  exit 1
fi
print '启动后打开 http://127.0.0.1:8787。关闭本窗口或按 Ctrl+C 可以停止木木。'
node --env-file-if-exists=.env server.mjs
code=$?
if (( code != 0 && code != 130 )); then
  read -r '?启动没有完成，按回车关闭。'
fi
exit $code
