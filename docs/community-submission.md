# Draft for the official community

Status: prepared, **not submitted**. Confirm release and CI links before posting in the official repository's **Show Your Plugins!** Discussions category.

Official contribution guidance currently says external code PRs are not accepted, while encouraging community plugins and the `dsh-plugin` repository topic:
https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md

## Proposed title

Joyhouse Library — local Markdown notes, daily journals and images inside Harness

## Proposed post

We open-sourced an MIT community plugin that adds a local-first personal library to the original Harness Web UI:

https://github.com/JoyhouseLabs/joyhouse-dsh-knowledge

It supports Markdown editing and preview, screenshots, search, tags, backlinks, explicit parent/child notes, daily-journal/free-writing templates, and Chinese/English UI. Language and panel switches retain drafts. Notes remain ordinary local files; no model API key, Joyhouse account, Workbench plugin or desktop shell is required.

The Host uses documented loopback, authenticated-owner Connection routes. The Client uses official sidebar/main/overlay slots; no Harness core files are patched. The current compatibility pin is 0.2.2-rc.1.

Installation uses the prebuilt tarball in the v0.5.0 GitHub release. See README for checksum verification and the exact `dsh plugin --profile web add` command. The source checkout builds independently and includes automated filesystem, RPC and packaged React tests; the compatibility document and Actions report distinguish verified checks from desktop visual acceptance.

Feedback on plugin API usage, accessibility and portability is welcome. This is a community project, not an official DeepSeek product.
