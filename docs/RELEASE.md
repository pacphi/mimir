# Release Process

## Quick Release

```bash
# 1. Ensure main is clean and up to date
git checkout main && git pull

# 2. Tag the release
git tag v0.1.0

# 3. Push the tag (triggers the release workflow)
git push origin v0.1.0
```

The [release workflow](../.github/workflows/release.yml) handles everything else: CI validation, Docker image builds, GitHub Release creation, and CHANGELOG updates.

## Tag Format

```
v<major>.<minor>.<patch>[-prerelease]
```

| Tag              | Type        | `latest` tag? |
| ---------------- | ----------- | ------------- |
| `v1.0.0`         | Stable      | Yes           |
| `v1.0.0-alpha.1` | Pre-release | No            |
| `v1.0.0-beta.2`  | Pre-release | No            |
| `v1.0.0-rc.1`    | Pre-release | No            |

## What the Workflow Does

The release workflow (`.github/workflows/release.yml`) runs 5 jobs:

1. **validate-tag** — Validates `v<semver>` format, detects pre-release
2. **ci** — Full CI gate: format check, typecheck, lint, test, build
3. **generate-changelog** — Generates changelog from conventional commits since previous tag
4. **docker-images** — Builds and pushes API + Web Docker images to GHCR
5. **create-release** — Creates GitHub Release, updates `CHANGELOG.md`, pushes to main

### Docker Image Tags

For a stable release like `v1.2.3`:

| Image                      | Tags                     |
| -------------------------- | ------------------------ |
| `ghcr.io/pacphi/mimir/api` | `1.2.3`, `1.2`, `latest` |
| `ghcr.io/pacphi/mimir/web` | `1.2.3`, `1.2`, `latest` |

For a pre-release like `v1.2.3-alpha.1`:

| Image                      | Tags            |
| -------------------------- | --------------- |
| `ghcr.io/pacphi/mimir/api` | `1.2.3-alpha.1` |
| `ghcr.io/pacphi/mimir/web` | `1.2.3-alpha.1` |

## Versioning Strategy

This project follows [Semantic Versioning](https://semver.org/):

- **Major** (`v1.0.0` → `v2.0.0`): Breaking API or protocol changes
- **Minor** (`v1.0.0` → `v1.1.0`): New features, backward-compatible
- **Patch** (`v1.0.0` → `v1.0.1`): Bug fixes, dependency updates

The version source of truth is the root `package.json`.

## Rollback

To roll back a release:

```bash
# 1. Find the previous stable tag
git tag -l "v*" --sort=-version:refname | head -5

# 2. Retag Docker images (example: rolling back to v1.1.0)
docker pull ghcr.io/pacphi/mimir/api:1.1.0
docker tag ghcr.io/pacphi/mimir/api:1.1.0 ghcr.io/pacphi/mimir/api:latest
docker push ghcr.io/pacphi/mimir/api:latest

# Repeat for web image
docker pull ghcr.io/pacphi/mimir/web:1.1.0
docker tag ghcr.io/pacphi/mimir/web:1.1.0 ghcr.io/pacphi/mimir/web:latest
docker push ghcr.io/pacphi/mimir/web:latest
```

For production deployments using Docker Compose, pin to a specific version tag rather than `latest`.

## Changelog Generation

The changelog script (`.github/scripts/generate-changelog.sh`) categorizes commits by conventional commit prefix:

| Prefix                    | Section       |
| ------------------------- | ------------- |
| `feat:`                   | Added         |
| `fix:`                    | Fixed         |
| `docs:`                   | Documentation |
| `deps:`                   | Dependencies  |
| `perf:`                   | Performance   |
| `refactor:`               | Changed       |
| `test:`                   | Tests         |
| `chore:`, `ci:`, `style:` | Maintenance   |

### Dry Run

```bash
bash .github/scripts/generate-changelog.sh 0.1.0 changelog-test.md
cat changelog-test.md
```

## Troubleshooting

### Tag push doesn't trigger workflow

Ensure you pushed the tag, not just the commit:

```bash
git push origin v0.1.0    # Push specific tag
git push origin --tags     # Push all tags
```

### CI gate fails during release

The release workflow runs the same CI checks as the main CI workflow. Fix the issue on `main` first, delete the tag, and retag:

```bash
git tag -d v0.1.0                # Delete local tag
git push origin :refs/tags/v0.1.0 # Delete remote tag
# ... fix the issue ...
git tag v0.1.0                   # Retag
git push origin v0.1.0
```

### CHANGELOG.md push fails

The workflow pushes to `main` with `[skip ci]`. If branch protection prevents this, configure the `GITHUB_TOKEN` permissions or use a PAT with push access.
