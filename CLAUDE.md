# KiwiFolio — Agent Instructions

## Releasing a new version

When bumping the version for a release, update **all three** of these together:

1. `package.json` — `"version"` field
2. `src/components/app-layout.tsx` — hardcoded `v0.x.x` string in `SidebarFooter`
3. The git tag pushed to trigger the Docker publish workflow (`.github/workflows/publish.yml`)

The CI workflow fires on `v*` tags and derives the Docker image tag from the git tag, so the tag is the source of truth. Keep `package.json` and the sidebar version string in sync with it.
