#!/usr/bin/env bash
# Changelog Generation Script for Mimir
# Usage: ./generate-changelog.sh <version> [output-file]
#
# Examples:
#   ./generate-changelog.sh 0.1.0
#   ./generate-changelog.sh 1.0.0-alpha.1 changelog-test.md
#
# Arguments:
#   version      - Version number without v prefix (e.g., 0.1.0)
#   output-file  - Output file path (default: changelog.md)

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <version> [output-file]" >&2
  echo "Example: $0 0.1.0 changelog.md" >&2
  exit 1
fi

VERSION="$1"
OUTPUT_FILE="${2:-changelog.md}"

CURRENT_TAG="v${VERSION}"
REPO="${GITHUB_REPOSITORY:-pacphi/mimir}"

echo "Generating changelog for $CURRENT_TAG" >&2

# Get previous tag (most recent tag before current)
ALL_TAGS=$(git tag -l "v*" --sort=-version:refname)
PREVIOUS_TAG=""

found_current=false
while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  if [[ "$found_current" == "true" ]]; then
    PREVIOUS_TAG="$tag"
    break
  fi
  if [[ "$tag" == "$CURRENT_TAG" ]]; then
    found_current=true
  fi
done <<< "$ALL_TAGS"

if [[ -z "$PREVIOUS_TAG" ]]; then
  echo "No previous tag found, using all commits up to $CURRENT_TAG" >&2
  FIRST_COMMIT=$(git rev-list --reverse HEAD 2>/dev/null | head -1) || true
  if [[ -n "$FIRST_COMMIT" ]]; then
    COMMIT_RANGE="${FIRST_COMMIT}^..$CURRENT_TAG"
  else
    COMMIT_RANGE="$CURRENT_TAG"
  fi
else
  echo "Generating changelog from $PREVIOUS_TAG to $CURRENT_TAG" >&2
  COMMIT_RANGE="$PREVIOUS_TAG..$CURRENT_TAG"
fi

# Initialize changelog sections
features=""
fixes=""
docs=""
deps=""
perf=""
refactor=""
chore=""
tests=""
other=""

# Parse commits
while IFS= read -r commit; do
  [[ -z "$commit" ]] && continue

  hash="${commit:0:7}"
  message="${commit:8}"

  case "$message" in
    feat:*|feat\(*)       features+="- $message ($hash)"$'\n' ;;
    fix:*|fix\(*)         fixes+="- $message ($hash)"$'\n' ;;
    docs:*|docs\(*)       docs+="- $message ($hash)"$'\n' ;;
    deps:*|deps\(*)       deps+="- $message ($hash)"$'\n' ;;
    perf:*|perf\(*)       perf+="- $message ($hash)"$'\n' ;;
    refactor:*|refactor\(*) refactor+="- $message ($hash)"$'\n' ;;
    chore:*|chore\(*)     chore+="- $message ($hash)"$'\n' ;;
    test:*|test\(*)       tests+="- $message ($hash)"$'\n' ;;
    ci:*|ci\(*)           chore+="- $message ($hash)"$'\n' ;;
    style:*|style\(*)     chore+="- $message ($hash)"$'\n' ;;
    *)                    other+="- $message ($hash)"$'\n' ;;
  esac
done < <(git log --oneline "$COMMIT_RANGE" 2>/dev/null || git log --oneline)

# Build changelog content
changelog="## [${VERSION}] - $(date +%Y-%m-%d)"$'\n\n'

[[ -n "$features" ]] && changelog+="### Added"$'\n\n'"$features"$'\n'
[[ -n "$fixes" ]] && changelog+="### Fixed"$'\n\n'"$fixes"$'\n'
[[ -n "$docs" ]] && changelog+="### Documentation"$'\n\n'"$docs"$'\n'
[[ -n "$deps" ]] && changelog+="### Dependencies"$'\n\n'"$deps"$'\n'
[[ -n "$perf" ]] && changelog+="### Performance"$'\n\n'"$perf"$'\n'
[[ -n "$refactor" ]] && changelog+="### Changed"$'\n\n'"$refactor"$'\n'
[[ -n "$tests" ]] && changelog+="### Tests"$'\n\n'"$tests"$'\n'
[[ -n "$chore" ]] && changelog+="### Maintenance"$'\n\n'"$chore"$'\n'
[[ -n "$other" ]] && changelog+="### Other"$'\n\n'"$other"$'\n'

# Installation section
changelog+="### Installation"$'\n\n'
changelog+='```bash'$'\n'
changelog+="# Pull Docker images"$'\n'
changelog+="docker pull ghcr.io/${REPO}/api:${VERSION}"$'\n'
changelog+="docker pull ghcr.io/${REPO}/web:${VERSION}"$'\n\n'
changelog+="# Or use latest stable"$'\n'
changelog+="docker pull ghcr.io/${REPO}/api:latest"$'\n'
changelog+="docker pull ghcr.io/${REPO}/web:latest"$'\n'
changelog+='```'$'\n\n'

# Add diff link if previous tag exists
if [[ -n "$PREVIOUS_TAG" ]] && [[ "$PREVIOUS_TAG" != "$CURRENT_TAG" ]]; then
  changelog+="**Full Changelog**: https://github.com/${REPO}/compare/$PREVIOUS_TAG...$CURRENT_TAG"$'\n'
fi

echo "$changelog" > "$OUTPUT_FILE"

echo "Changelog written to $OUTPUT_FILE" >&2
echo "Changelog for ${CURRENT_TAG} generated successfully!" >&2
