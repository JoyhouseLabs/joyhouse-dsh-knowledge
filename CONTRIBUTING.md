# Contributing

Use Node 24.9+ and pnpm 10.28.2. Run `pnpm install --frozen-lockfile` and `pnpm check` before a pull request. Keep changes inside this plugin; do not patch Harness internals. Follow official slots, owner authentication and the pinned runtime contracts.

Keep Chinese and English keys complete. Preserve existing writing, folders, tags, clipboard behavior and pending drafts. Never upload real notes, screenshots, model keys, sync credentials or local profiles in an issue or fixture. Use synthetic sample data.

The release is exported from the Joyhouse product checkout through an explicit source/test allowlist. Plugin changes accepted here must be reconciled with the product package before the next export; exports must never silently overwrite accepted contributions. Prebuilt release archives include third-party license notices. Version and source changes require rebuild, tests and a fresh checksum.
