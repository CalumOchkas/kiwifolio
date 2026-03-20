# KiwiFolio — Agent Instructions

## Releasing a new version

When bumping the version for a release, update **all three** of these together:

1. `package.json` — `"version"` field
2. The git tag pushed to trigger the Docker publish workflow (`.github/workflows/publish.yml`)

The sidebar version is read from `package.json` via the app layout, and the CI workflow fires on `v*` tags and derives the Docker image tag from the git tag. Keep `package.json` and the git tag in sync.
