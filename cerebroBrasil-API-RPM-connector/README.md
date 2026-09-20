# CerebroBrasil API RPM Connector

Linux/RPM command-line connector for **cerebrobrasil.com.br**.

This package installs the `cerebrobrasil` CLI. It is intentionally API-contract agnostic so the first RPM can be tested before the final CerebroBrasil API routes are frozen.

## Configuration

Default API base URL:

```text
https://cerebrobrasil.com.br
```

Configure a different API base:

```bash
cerebrobrasil config set-url https://cerebrobrasil.com.br
```

Set your API token locally:

```bash
cerebrobrasil config set-token
```

The token is stored in `~/.config/cerebrobrasil/token` with mode 600 and is never committed to Git.

## Tests

```bash
cerebrobrasil detect
cerebrobrasil doctor
cerebrobrasil ping
cerebrobrasil get /
```

For an API endpoint:

```bash
cerebrobrasil get /api/v1/health
cerebrobrasil post /api/v1/test '{"message":"Hello from Linux RPM"}'
```

The connector sends `Authorization: Bearer <token>` when a local token is configured.

## Build RPM

```bash
chmod +x build-rpm.sh SOURCES/cerebrobrasil
./build-rpm.sh
```

Output is written to `dist/`.

> The public site did not expose discoverable CerebroBrasil API documentation during creation of this connector, so endpoint names such as `/api/v1/health` are examples until the application's actual API contract is confirmed.

## Security and local bridge

Only HTTPS is accepted for remote APIs. HTTP is allowed on localhost for development.
Paths must start with one `/`; redirects are not followed. The stored Bearer token is
passed to curl on stdin, not in process arguments. Requests have connection/total timeouts.
Configuration is written atomically with private permissions; symlinked configuration is rejected.

For the local bridge in the repository root:

```bash
cerebrobrasil config set-url http://127.0.0.1:8080
cerebrobrasil config set-token
cerebrobrasil get /health
cerebrobrasil post /v1/builder/plan '{"briefing":"Site institucional"}'
```

Enter the locally configured INTERNAL_API_TOKEN at the hidden prompt. Do not place it
in command arguments or a browser. Planning needs a configured upstream adapter.
