#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
command -v rpmbuild >/dev/null || {
  echo "Installing RPM build tools..."
  if command -v dnf >/dev/null; then sudo dnf install -y rpm-build rpmdevtools; else echo "dnf required"; exit 1; fi
}
TOPDIR="$(mktemp -d)"
trap 'rm -rf "$TOPDIR"' EXIT
mkdir -p "$TOPDIR"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cp SOURCES/cerebrobrasil-codex "$TOPDIR/SOURCES/"
cp SPECS/cerebrobrasil-openai-codex-connector.spec "$TOPDIR/SPECS/"
rpmbuild --define "_topdir $TOPDIR" -bb "$TOPDIR/SPECS/cerebrobrasil-openai-codex-connector.spec"
mkdir -p dist
find "$TOPDIR/RPMS" -type f -name '*.rpm' -exec cp -v {} dist/ \;
echo "RPM output:"
ls -lh dist/
