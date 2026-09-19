# CerebroBrasil OpenAI Codex RPM Connector

RPM packaging wrapper for OpenAI Codex CLI on RPM-based Linux distributions.

The RPM installs a `cerebrobrasil-codex` bootstrap command. That command detects the Linux distribution and architecture and installs/updates Codex through OpenAI's official standalone installer.

## Why a bootstrap RPM?

Codex itself is installed from OpenAI's official distribution channel rather than repackaging OpenAI binaries inside a Vimaka RPM. This keeps the OpenAI component sourced from its official installer and avoids embedding credentials.

## Build

Fedora/RHEL/Rocky/Alma/Amazon Linux:

```bash
sudo dnf install -y rpm-build rpmdevtools
rpmdev-setuptree
cp SPECS/cerebrobrasil-openai-codex-connector.spec ~/rpmbuild/SPECS/
cp SOURCES/cerebrobrasil-codex ~/rpmbuild/SOURCES/
rpmbuild -bb ~/rpmbuild/SPECS/cerebrobrasil-openai-codex-connector.spec
```

The resulting RPM will normally be under:

```text
~/rpmbuild/RPMS/noarch/
```

## Install RPM

```bash
sudo dnf install ./cerebrobrasil-openai-codex-connector-1.0.0-1*.noarch.rpm
```

Then, as the normal desktop/developer user:

```bash
cerebrobrasil-codex install
source ~/.bashrc
codex
```

## Commands

```bash
cerebrobrasil-codex detect
cerebrobrasil-codex install
cerebrobrasil-codex doctor
cerebrobrasil-codex run
```

No ChatGPT password, API key, access token, or session token is stored in this repository or RPM.

Project: https://cerebrobrasil.com.br
