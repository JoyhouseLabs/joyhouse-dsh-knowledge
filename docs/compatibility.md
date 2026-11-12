# Compatibility evidence

Release candidate: 0.5.0. Runtime contract: official `@deepseek-ai/dsh@0.2.2-rc.1`.

## Local checks — 2026-11-12

Environment: macOS arm64, Node 24.21.0, pnpm 10.28.2.

- Independent checkout installed from its frozen lockfile, with no sibling monorepo links.
- Type checking and production Host/Client builds passed.
- 24 automated tests passed: real Cordis HostConnectionService and Client installConnection, owner/guest admission, filesystem path/symlink/size boundaries, stale writes, images, metadata, packaged React UI actions, draft/caret preservation and Chinese/English switching.
- Official CLI version check passed.
- Official `dsh plugin --profile web add` installed the prebuilt archive into a fresh temporary `DSH_HOME`, with lifecycle scripts disabled, automatic peer installation disabled and offline mode enabled. The profile contains official base/web bundles plus this plugin, without Workbench or Joyhouse Desktop.
- Official profile composition (`--dump-config`) includes the library Host plugin.
- Local authenticated HTTP/browser testing was blocked: the execution environment rejected loopback listening with `listen EPERM`. This is **not a passed Web test**. The test exits nonzero and records the blocked result.

## CI

The public workflow repeats the standalone build and tests, installs the exact official CLI from npm, and runs an isolated Web startup, official launch-token/cookie exchange, anonymous rejection and authenticated vault RPC check. The JSON report is uploaded as an artifact. Consult the actual workflow result; configuration alone is not evidence of a successful run.

No model call is required. No personal account, existing profile or user vault is used. DOM tests and HTTP smoke tests do not establish visual acceptance in a packaged desktop app. Other runtime versions, Windows and signed desktop builds are not qualified by these results.
