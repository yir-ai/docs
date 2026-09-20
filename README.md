# Yir developer documentation

Public source for [Yir developer documentation](https://yir.ai/docs) and its
[Simplified Chinese edition](https://yir.ai/zh/docs). Built with Blume as a static site.

## Contribute

[Report an error](https://github.com/yir-ai/docs/issues/new?template=documentation.yml)
or use **Edit on GitHub** on a page. See [CONTRIBUTING.md](CONTRIBUTING.md).
English guides live in `docs/`; Chinese guides live in `docs/zh/`.
This repository is the single editing source for both languages.

## Develop

Requires Node.js 22 and pnpm 10.26.1. No private repository or credentials are needed.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm publish:check
pnpm build
```

Start local development explicitly with `pnpm dev`, or preview a completed build
with `pnpm preview`. Tests build a disposable copy in `.tmp/`.

## Public contracts

`openapi/` contains reviewed, generated public API and model contract snapshots.
Do not edit generated fields by hand. Report contract issues so maintainers can
correct the source and submit reviewed updates.

## Static output

`pnpm build` produces the English and Chinese static website in `dist/`.
CI checks public repository boundaries, both languages, links and search.
The build contains only public website content and can be hosted independently.
Production operations are maintained separately; merging a change does not deploy it.
