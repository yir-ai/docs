# Yir developer documentation

始终中文回答。公开正文默认英文，简体中文对应页面位于 `docs/zh/`。

- 本仓库是开发者文档的唯一编辑源，使用 Blume 静态构建。
- 使用 pnpm；不自动启动开发服务，需要预览时由用户运行 `pnpm dev`。
- 不加入内部凭据、用户数据、真实请求记录、部署配置或非公开运营信息。
- `openapi/` 是经过审查的公共合同快照；不要手工修改生成字段。中文 API Reference 由 `pnpm localize:openapi` 按 `openapi/i18n/zh.json`（英文原文 → 译文）生成；同步合同后在同一提交补齐译文，术语与 `docs/zh/` 一致。
- `patches/blume@*.patch` 把 Reference 界面标签（Responses、required 等）按语言取 `src/components/openapi/strings.ts`；升级 Blume 时重做补丁，上游支持后删除。
- 外部贡献者无需访问其他仓库即可安装、检查和构建。
- 更新指南时保持中英文一致；合同问题通过 Issue 报告，由维护者修正上游后同步。
- 验证使用 `pnpm check`、`pnpm publish:check`；完整静态构建由 CI 执行。
- 新增文件须通过 `pnpm check:public` 的公开路径与内容检查。
- PR 检查不使用生产凭据，合并不自动部署。
