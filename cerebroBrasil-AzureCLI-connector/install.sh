#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ ${EUID} -ne 0 ]]; then
  echo "Execute com sudo: sudo ./install.sh"
  exit 1
fi

if ! command -v dnf >/dev/null 2>&1; then
  echo "Este instalador RPM suporta sistemas com dnf (RHEL/Rocky/Alma/Fedora/Amazon Linux compatível)."
  exit 1
fi

dnf -y install curl ca-certificates gnupg2 git

rpm --import https://packages.microsoft.com/keys/microsoft.asc

rhel_major="$(rpm -E %rhel 2>/dev/null || true)"

if [[ "$rhel_major" =~ ^(8|9)$ ]]; then
  dnf -y install "https://packages.microsoft.com/config/rhel/${rhel_major}/packages-microsoft-prod.rpm"
elif [[ "$rhel_major" == "10" ]]; then
  rpm --import https://packages.microsoft.com/keys/microsoft-2025.asc
  dnf -y install "https://packages.microsoft.com/config/rhel/10/packages-microsoft-prod.rpm"
else
  cat >/etc/yum.repos.d/azure-cli.repo <<'EOF'
[azure-cli]
name=Azure CLI
baseurl=https://packages.microsoft.com/yumrepos/azure-cli
enabled=1
gpgcheck=1
gpgkey=https://packages.microsoft.com/keys/microsoft.asc
EOF
fi

dnf -y install azure-cli

install -m 0755 "$SCRIPT_DIR/cerebrobrasil-azure" /usr/local/bin/cerebrobrasil-azure

echo "Azure CLI instalado."
echo "Use: cerebrobrasil-azure login"
