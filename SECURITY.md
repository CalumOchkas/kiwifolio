# Security Policy

## Scope

KiwiFolio is a **self-hosted, single-user** application designed to run on trusted local networks. It has **no authentication** and should not be exposed directly to the public internet.

## What This Means

- Anyone with network access to the running instance can read and modify all data.
- The application trusts all incoming requests unconditionally.
- There is no rate limiting, CSRF protection, or session management.

## Recommended Deployment

- Run behind a firewall or on `localhost` only.
- If remote access is needed, place behind a reverse proxy with authentication (e.g., Tailscale, Cloudflare Tunnel with Access, or an nginx basic-auth proxy).

## Reporting Vulnerabilities

If you discover a security issue, please open a [GitHub Issue](https://github.com/calumochkas/kiwifolio/issues) describing the vulnerability.

For sensitive disclosures, you can use [GitHub private vulnerability reporting](https://github.com/calumochkas/kiwifolio/security/advisories/new).
