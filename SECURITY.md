# Security

Supported release line: 0.5.x on the exact Harness runtime declared in `engines.dsh`.

Do not include private notes, paths containing personal information, API keys or authentication URLs in public issues. Use GitHub's private vulnerability reporting if enabled for this repository. If unavailable, open an issue asking for a private reporting channel without disclosing the exploit or sensitive data.

The Host plugin runs with local account permissions. Owner-only loopback RPC, path validation, symlink rejection, size limits, HTML sanitization and local attachment resolution limit its exposed surface; they do not sandbox third-party plugin code. Notes are ordinary unencrypted files. Cloud sync and model access are not part of the standalone plugin.
