# YIR public docs source

This directory contains the public documentation source for YIR.

Mintlify should not connect to the private YIR monorepo. Instead, build and sync this directory into a separate public docs repository, then connect Mintlify to that repository.

## Local workflow

```bash
cd docs-public
pnpm install
pnpm run build
pnpm run validate
pnpm run dev
```

`pnpm run dev` starts Mintlify on port `38086`. Start it manually from VS Code when you want a local preview.

## Publish workflow

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/docs/build-public-docs.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/docs/sync-public-docs.ps1 -TargetRoot D:\Project\yir-docs
```

The sync script writes to the target repository. Use it only when the target path is the dedicated public docs repository.
