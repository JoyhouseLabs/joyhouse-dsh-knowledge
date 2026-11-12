# Joyhouse Library for DeepSeek Harness

[简体中文](README.zh.md) · **Independent community plugin · MIT**

A local-first personal library for notes, daily journals, free writing and images, inside the **original DeepSeek Harness Web UI**. No Joyhouse Desktop, Workbench, Island account, API key or model call is required for library operations.

## Features

- Portable Markdown files, formatting toolbar, preview and autosave with stale-write protection.
- Paste screenshots or attach PNG/JPEG/GIF/WebP files (10 MB per image).
- Search, note-owned tags, backlinks, outgoing links and explicit parent/child relationships.
- Daily journal and free-writing templates; reopening today's journal preserves existing writing.
- Chinese and English UI following Harness language settings, without discarding drafts.
- Native sidebar entry and main panel; optional focus mode retains editing state.
- Rename confirmation with optional title update; deletion moves files to `.trash`.

The editor is a toolbar-assisted Markdown textarea, not a WYSIWYG editor. Renaming does not rewrite references in other notes. Images are local attachments; remote image URLs are not loaded by the preview.

## Install

Supported runtime: **official `@deepseek-ai/dsh@0.2.2-rc.1`**, Node **24.9+**, Web profile. Other Harness versions are not yet qualified. Install the official CLI using its own instructions before adding this plugin.

1. Download `joyhouse-dsh-knowledge-0.5.0.tgz` and `SHA256SUMS` from [Releases](https://github.com/JoyhouseLabs/joyhouse-dsh-knowledge/releases/tag/v0.5.0).
2. Verify the archive with `shasum -a 256 -c SHA256SUMS` (or `sha256sum -c SHA256SUMS` on Linux).
3. Exit Harness and install the **prebuilt** archive:

```sh
dsh plugin --profile web add /absolute/path/to/joyhouse-dsh-knowledge-0.5.0.tgz
dsh web
```

Open the authenticated URL printed by `dsh web`, then select **Library**. Create the library when prompted. This release uses a tarball so installation does not need a source-build script. Do not use a Git-source install: this repository does not commit `lib/` and does not run an implicit `prepare` script. The package has not been published to npm.

## Storage and trust

Default: `$DSH_HOME/joyhouse/library/vault` (Harness defaults `DSH_HOME` to `~/.dsh`). Set `JOYHOUSE_KNOWLEDGE_ROOT` to an existing absolute directory **before launching Harness** to use another vault. No automatic migration is performed. Existing nonempty vaults are not populated with welcome content.

The Host plugin runs locally with the account's filesystem permissions. Its RPC is restricted to authenticated owner clients on loopback; remote authorities are rejected. Agent tools do not gain access to this private file endpoint. The UI does not send notes to a model. Use only plugin sources you trust; installing a Host plugin is not a sandbox boundary.

Notes are limited to 2 MiB, images to 10 MiB, scans to 10,000 entries / 32 MiB text. Hidden paths, traversal and symlinks are rejected. Keep backups and confirm autosave before quitting.

Joyhouse Desktop may provide an optional native folder chooser and cloud-sync bridge. These enhancements are not included in original Harness mode and their unavailable controls are hidden. This repository includes neither a cloud service nor a gateway.

## Develop

```sh
corepack pnpm install --frozen-lockfile
pnpm check
pnpm pack --pack-destination dist
```

The checkout is self-contained. It has no `workspace:` or `catalog:` dependency and requires no sibling private repository. Exact development dependencies are locked. Tests cover filesystem boundaries, owner RPC through real Cordis/Connection services, packaged React interactions, locale changes and draft preservation.

For isolated testing with an already installed official CLI:

```sh
DSH_CLI=/absolute/path/to/@deepseek-ai/dsh/lib/bin.js pnpm test:official
```

See [compatibility evidence](docs/compatibility.md), [contributing](CONTRIBUTING.md) and [security](SECURITY.md). JoyhouseLabs maintains this community plugin; it is not an official DeepSeek product. See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled-library attribution.
