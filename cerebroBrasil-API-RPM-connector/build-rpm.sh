#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
command -v rpmbuild >/dev/null || {
  if command -v dnf >/dev/null; then
    sudo dnf install -y rpm-build rpmdevtools
  else
    echo "Build this RPM on a system with rpmbuild/dnf."
    exit 1
  fi
}
TOPDIR="$(mktemp -d)"
trap 'rm -rf "$TOPDIR"' EXIT
mkdir -p "$TOPDIR"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cp SOURCES/cerebrobrasil "$TOPDIR/SOURCES/"
cp SPECS/cerebrobrasil-api-connector.spec "$TOPDIR/SPECS/"
rpmbuild --define "_topdir $TOPDIR" -bb "$TOPDIR/SPECS/cerebrobrasil-api-connector.spec"
mkdir -p dist
find "$TOPDIR/RPMS" -type f -name '*.rpm' -exec cp -v {} dist/ \;
ls -lh dist/
