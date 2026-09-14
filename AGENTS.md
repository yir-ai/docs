# Yir developer documentation

始终中文回答。公开正文默认英文，简体中文对应页面位于 `docs/zh/`。

- 本仓库是开发者文档的唯一编辑源，使用 Blume 静态构建。
- 使用 pnpm；不自动启动开发服务。需要预览时由用户运行 VS Code 的 Docs task。
- Windows Docs task 使用 `scripts/dev-service.ps1 -Action Watch`。已运行且归属确认的服务允许 Agent 先执行 `-Action Restart -DryRun`，再执行 `-Action Restart` 并核验恢复，无需重复确认。不停止其他服务，不在没有 watcher 时另起实例；热更新有效时无需重启。
- 不加入内部凭据、用户数据、真实请求记录或非公开运营信息。
- `openapi/` 是经过审查的公共合同快照。维护者通过 `pnpm sync:openapi <source-directory>` 导入；不要手工修改生成字段。
- 外部贡献者无需访问其他仓库即可安装、检查和构建。
- 更新指南时保持中英文一致；合同问题通过 Issue 报告，由维护者修正上游后同步。
- 验证使用 `pnpm check`、`pnpm publish:check`；生产构建和 Linux Origin smoke 由 CI 执行。
- PR 检查不使用生产凭据，生产部署必须另获明确授权。
