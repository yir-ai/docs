# AGENTS.md - YIR public docs

始终用中文回答，但 `docs-public` 面向公开开发者文档，正文默认使用英文；只有 `zh-Hans/` 下的页面使用简体中文。

本目录只能包含可公开内容。不要写入内部密钥、生产配置、供应商折扣、非公开成本、账号池、内部排障日志、用户数据、Header/Cookie/token、完整 prompt 或任何无法公开的运营策略。

Mintlify 只消费发布仓库中的文档产物；本目录是主仓库内的公开文档源。修改 API、鉴权、错误码、异步任务、callback、provider/source 兼容行为或 SDK 行为时，同步更新这里。

OpenAPI 规则：
- `openapi-src/` 是可人工维护的源。
- `openapi/` 是 Mintlify 读取的单文件产物。
- 路径、operationId、schema 字段名和状态码必须与代码契约一致。
- 多语言只翻译人读文本，不改变结构字段。
- 不要使用外部 `$ref` 指向本目录外文件。

本地命令：
- `pnpm install`
- `pnpm run dev`
- `pnpm run validate`
- `pnpm run build`

同步到独立 docs 仓库时使用根目录脚本 `scripts/docs/sync-public-docs.ps1`，目标目录必须由调用者显式传入。
