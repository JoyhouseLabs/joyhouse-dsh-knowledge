# Joyhouse 资料中心 · DeepSeek Harness 插件

[English](README.md) · **独立社区插件 · MIT 开源**

在原版 DeepSeek Harness Web 中管理 Markdown 笔记、今日日志、随笔与图片。无需 Joyhouse Desktop、工作台、Island 账号、API Key 或模型调用。

支持格式工具栏、预览、自动保存、截图粘贴、搜索、标签、双向链接、显式父子笔记、专注模式与中英文切换。模板自动填入日期；已有日志不被覆盖。切换模块或语言时保留当前草稿。删除进入 `.trash`；重命名可同步更新标题，但不会自动重写其他笔记中的引用。当前是 Markdown 文本编辑器，并非所见即所得编辑器。

## 安装

已声明兼容 **官方 `@deepseek-ai/dsh@0.2.2-rc.1`、Node 24.9+、Web profile**；其他版本需要单独验证。

1. 从 [Releases](https://github.com/JoyhouseLabs/joyhouse-dsh-knowledge/releases/tag/v0.5.0) 下载 `joyhouse-dsh-knowledge-0.5.0.tgz` 和 `SHA256SUMS`。
2. 执行 `shasum -a 256 -c SHA256SUMS` 校验（Linux 可用 `sha256sum`）。
3. 退出 Harness，使用已安装的官方 CLI：

```sh
dsh plugin --profile web add /完整路径/joyhouse-dsh-knowledge-0.5.0.tgz
dsh web
```

用 CLI 打印的带认证链接打开网页，点击「资料中心」，首次使用时创建资料库。这里安装的是预构建包，无须执行源码构建脚本。暂未发布 npm 包；请勿直接以 Git 源码地址安装，因为源码仓库不提交 `lib/`，也不隐式执行 `prepare`。

## 数据与边界

默认存储于 `$DSH_HOME/joyhouse/library/vault`，Harness 默认 `DSH_HOME` 为 `~/.dsh`。启动前设置 `JOYHOUSE_KNOWLEDGE_ROOT` 为绝对路径可使用已有目录。不自动迁移用户文件，已有非空资料库不写入欢迎笔记。

笔记与附件都是普通本地文件；界面不把内容发送给大模型。Host 插件拥有运行账号的本地权限，因此仅安装信任的插件。文件 RPC 只允许本机 loopback 与已认证 owner，拒绝远程 authority、路径穿越、隐藏路径及符号链接。不会给 Agent 自动授予资料读取工具。

单篇笔记最多 2 MiB，每张图片最多 10 MiB；扫描最多 10,000 项、文本索引共 32 MiB。退出前确认「已保存」，重要资料请备份。原版 Harness 模式不包含云服务和原生选目录；Joyhouse Desktop 的可选增强不属于本仓库的运行前提。

## 开发与测试

```sh
corepack pnpm install --frozen-lockfile
pnpm check
pnpm pack --pack-destination dist
DSH_CLI=/官方安装目录/@deepseek-ai/dsh/lib/bin.js pnpm test:official
```

仓库包含完整源代码和精确依赖，不需要私有 monorepo 或相邻工作台源码。测试范围及限制见 [兼容性记录](docs/compatibility.md)。这是 JoyhouseLabs 的社区插件，不代表 DeepSeek 官方背书。
