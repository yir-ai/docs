# Contributing to Yir docs

Report unclear or incorrect documentation in [Issues](https://github.com/yir-ai/docs/issues/new?template=documentation.yml). Include the page URL, the relevant text, and your suggested correction. Never include API keys or private request data.

To propose a fix, use **Edit on GitHub** on a documentation page, or fork this repository and open a pull request. English pages live in `docs/`; their Simplified Chinese counterparts live in `docs/zh/`. Update both when possible; tell us if you need translation help.

Install Node.js 22 and pnpm 10.26.1, then run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm publish:check
```

The repository builds without access to any private repository. `openapi/` contains generated public contract snapshots. Report contract errors in an Issue; maintainers fix the upstream definition and submit a reviewed snapshot update.

Pull requests run checks without production credentials. Merging a change does not deploy it automatically.
