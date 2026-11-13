#!/bin/zsh
# Start the private local app without placing credentials in command arguments.
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '需要先安装 Node.js 22 或更高版本，再启动木木。'
  read -r '?按回车关闭。'
  exit 1
fi
# Follow the user's existing macOS HTTPS proxy, only for this child process.
if [[ -z "$HTTPS_PROXY" && -z "$https_proxy" ]] && node --help | grep -q -- '--use-env-proxy'; then
  mumu_proxy_config=$(scutil --proxy)
  mumu_proxy_enabled=$(print -r -- "$mumu_proxy_config" | awk '/HTTPSEnable :/ {print $3}')
  mumu_proxy_host=$(print -r -- "$mumu_proxy_config" | awk '/HTTPSProxy :/ {print $3}')
  mumu_proxy_port=$(print -r -- "$mumu_proxy_config" | awk '/HTTPSPort :/ {print $3}')
  if [[ "$mumu_proxy_enabled" == 1 && -n "$mumu_proxy_host" && "$mumu_proxy_port" == <-> ]]; then
    export HTTPS_PROXY="http://${mumu_proxy_host}:${mumu_proxy_port}"
    export NODE_USE_ENV_PROXY=1
    export NO_PROXY="${NO_PROXY:+$NO_PROXY,}localhost,127.0.0.1"
  fi
fi
if [[ -n "$HTTPS_PROXY" || -n "$https_proxy" ]] && node --help | grep -q -- '--use-env-proxy'; then
  export NODE_USE_ENV_PROXY=1
fi
print '聊天版：http://127.0.0.1:8787/visit/'
print '启动后打开 http://127.0.0.1:8787。关闭本窗口或按 Ctrl+C 可以停止木木。'
node --env-file-if-exists=.env server.mjs
code=$?
if (( code != 0 && code != 130 )); then
  read -r '?启动没有完成，按回车关闭。'
fi
exit $code
