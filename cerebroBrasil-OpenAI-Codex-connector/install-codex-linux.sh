#!/usr/bin/env bash
set -Eeuo pipefail

# CerebroBrasil OpenAI Codex CLI Connector
# Detects Linux distribution/architecture, installs prerequisites,
# then invokes OpenAI's official standalone Codex installer.

if [[ ${EUID} -eq 0 ]]; then
  echo "Run this installer as your normal user, not as root/sudo."
  exit 1
fi

OS="$(uname -s)"
ARCH="$(uname -m)"
[[ "$OS" == "Linux" ]] || { echo "This connector targets Linux."; exit 1; }

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
else
  ID="unknown"; VERSION_ID="unknown"; PRETTY_NAME="Unknown Linux"
fi

echo "CerebroBrasil Codex Connector"
echo "Distribution: ${PRETTY_NAME:-$ID}"
echo "Architecture: $ARCH"

install_prereqs() {
  case "${ID:-}" in
    ubuntu|debian|linuxmint|pop)
      sudo apt-get update
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates git
      ;;
    fedora|rhel|centos|rocky|almalinux|amzn)
      sudo dnf install -y curl ca-certificates git
      ;;
    arch|manjaro)
      sudo pacman -Sy --needed --noconfirm curl ca-certificates git
      ;;
    opensuse*|sles)
      sudo zypper --non-interactive install curl ca-certificates git
      ;;
    *)
      echo "Unknown distribution: ${ID:-unknown}"
      echo "Attempting installation if curl is already available."
      ;;
  esac
}

install_prereqs
command -v curl >/dev/null || { echo "curl is required."; exit 1; }

echo "Installing/updating OpenAI Codex CLI using the official installer..."
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# Common user install paths.
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  touch "$rc"
  grep -q 'CerebroBrasil Codex PATH' "$rc" 2>/dev/null || cat >> "$rc" <<'EOF'

# CerebroBrasil Codex PATH
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
EOF
done

hash -r 2>/dev/null || true

echo
if command -v codex >/dev/null 2>&1; then
  echo "Codex installed successfully."
  echo "Binary: $(command -v codex)"
  codex --version
else
  echo "Installation finished, but Codex is not visible in this shell yet."
  echo "Run: source ~/.bashrc"
fi

cat <<'EOF'

Next:
  source ~/.bashrc
  codex

On first run, choose "Sign in with ChatGPT" if you want to use your
eligible ChatGPT plan. No ChatGPT password, API key, or token is embedded
or committed by this connector.
EOF
