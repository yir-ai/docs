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
pnpm release:verify
```

Start preview explicitly with the VS Code **Dev: Docs (Blume)** task, or
`pnpm exec blume dev --port 40084 --host 0.0.0.0`.
Tests build a disposable copy in `.tmp/`, leaving the development runtime untouched.

## API contracts

`openapi/` contains reviewed public OpenAPI and model contract snapshots. Builds use
these committed files. Do not edit generated fields by hand. Maintainers import
reviewed upstream exports with:

```sh
pnpm sync:openapi /path/to/reviewed-contracts
pnpm publish:check
```

The source directory must contain `standard-openapi.json` and
`standard-model-contracts.json`. Submit the changes as a pull request.
The upstream project owns contract generation and source consistency checks.
Only explicitly registered operations appear in the reference.

## Static release

CI checks both languages, public-content contracts, static search, and Linux Origin
installation and rollback. It uploads `yir-docs-origin-<git-sha>` containing `dist`.
The artifact contains `/docs/*` and `/zh/docs/*`; `.yir-docs-release.json` records
the mounts. Other website paths remain outside this artifact.

Generic Nginx mount examples are in `deploy/nginx/`. On an authorized Linux origin:

```sh
node scripts/origin-release.mjs verify --artifact /path/to/artifact
node scripts/origin-release.mjs install --artifact /path/to/artifact --release-root /srv/yir/docs --release-id <git-sha>
node scripts/origin-release.mjs status --release-root /srv/yir/docs
node scripts/origin-release.mjs rollback --release-root /srv/yir/docs
```

Installation uses immutable releases and an atomic symlink switch. These commands
do not upload files or change Nginx. Production deployment requires separate approval;
merging a pull request does not deploy. CI has no production credentials.

The site has no request runtime, browser API playground, or AI chat. Examples use
server-side clients calling `https://gateway.yir.ai`.
