# cerebroBrasil-OpenAI-Codex-connector

Linux installer/connector for the official OpenAI Codex CLI.

## What it does

- detects the Linux distribution from `/etc/os-release`;
- detects CPU architecture;
- installs basic prerequisites with APT, DNF, Pacman, or Zypper where supported;
- installs/updates Codex using OpenAI's official standalone installer;
- ensures common user binary directories are available in PATH;
- never embeds ChatGPT passwords, API keys, or authentication tokens.

## Supported installer paths

Tested design targets:

- Ubuntu / Debian and derivatives
- Fedora / RHEL / Rocky / Alma / Amazon Linux
- Arch / Manjaro
- openSUSE / SLES

OpenAI officially documents Codex CLI for Linux and its standalone installer is:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

## Install

```bash
chmod +x install-codex-linux.sh
./install-codex-linux.sh
source ~/.bashrc
codex
```

Do not run the whole script with `sudo`. It requests sudo only for the OS package manager.

## CerebroBrasil / Vimaka

Project: https://cerebrobrasil.com.br

Repository: https://github.com/vimakasystems-git/vimaka-CerebroBrasil-connectors
