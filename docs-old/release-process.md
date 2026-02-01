# Release Process

This repo uses an automated, low-touch release flow based on Release-Please and Conventional Commits. The goal is to keep versioning and changelogs consistent while minimizing manual work.

## Goals

- Automatic releases on merge to `main`
- Clear, human-readable changelogs
- Publish only `@stina/extension-api` to npm
- Keep the rest of the monorepo private

## Tools

- Release-Please (GitHub Action)
- Conventional Commits for version calculation

## Repo Configuration

- `release-please-config.json` controls the release strategy.
- `.release-please-manifest.json` stores the current released version.
- Root version is the source of truth; `packages/extension-api/package.json` is kept in sync via `extra-files`.
- Commit messages are enforced with commitlint via a `commit-msg` Git hook (Conventional Commits).

## Conventional Commits

Format:

```
type(scope): short description
```

Examples:

```
feat(extension-api): add tool registry helpers
fix(core): handle empty theme list
docs: clarify extension permissions
feat!: drop Node 18 support
```

Versioning rules:

- `feat` -> minor bump
- `fix` -> patch bump
- `!` or `BREAKING CHANGE:` -> major bump
- other types do not bump by default

## Release Flow

1. Merge changes to `main`.
2. Release-Please opens or updates a release PR:
   - Updates versions
   - Updates `CHANGELOG.md`
3. Merge the release PR.
4. Release-Please creates a tag and GitHub release.
5. The release workflow runs on the tag:
   - Builds release assets and uploads them to the GitHub release
   - Publishes `@stina/extension-api` to npm

## Required Secrets and Settings

- `RELEASE_PLEASE_TOKEN` (GitHub PAT with repo access) so release tags and PRs trigger workflows
- Enable `Settings -> Actions -> General -> Allow GitHub Actions to create and approve pull requests`
- `id-token: write` workflow permission is required for npm provenance
- For npm publishing, use Trusted Publisher (recommended) or add `NPM_TOKEN` as a fallback

## npm Publishing (extension-api only)

This repo is intended to publish only one package:

- `@stina/extension-api` in `packages/extension-api`

To enable npm publishing:

- Ensure `"private": false` and `publishConfig.access = "public"` in `packages/extension-api/package.json`
- Configure npm Trusted Publisher for this repository and workflow (recommended)
- If not using Trusted Publisher, add `NPM_TOKEN` to GitHub Actions secrets
- Keep release-please `extra-files` pointing at the extension-api package.json

## Manual Overrides

If a release needs a specific version or notes, edit the release PR before merging. Release-Please uses the release PR content as the final release notes.
