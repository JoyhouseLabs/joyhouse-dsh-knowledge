# Joyhouse Library

This is an independent MIT community plugin for official DeepSeek Harness. Keep upstream source unmodified, use documented slots and owner-only loopback capabilities, and preserve all existing user content.

Use the pinned Node/pnpm/Harness versions. Run `pnpm check` after source changes. Use `pnpm test:official` with `DSH_CLI` pointing to the official CLI for isolated installation/HTTP smoke tests; never use a personal profile or vault as a test fixture. Do not claim visual or multi-platform acceptance from Node/DOM checks.

Keep English and Chinese UI dictionaries complete. Locale switching must retain editor DOM, caret and forms. Store translated feedback as keys. Existing notes, names and tags are user data, not UI copy.

Do not commit node_modules, lib, dist, real notes, auth URLs, credentials or machine-specific paths. Build release tarballs from checked source, include LICENSE and third-party notices, and record a SHA-256 digest. No implicit npm publication or official-community messages.
