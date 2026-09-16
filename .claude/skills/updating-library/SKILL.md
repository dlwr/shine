---
name: updating-library
description: ライブラリをアップデートする
---

以下の手順でやります

- `pnpm update --latest --recursive`
- `pnpm type-check`
- `pnpm lint:fix`
- `pnpm test`

途中でエラーが発生したら、修正してください。
全工程が終わったら、Pull Requestを作ってください。
