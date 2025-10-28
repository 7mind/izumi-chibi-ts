# GitHub Actions Workflows

This directory contains automated workflows for DITS.

## Workflows

### CI Workflow (`ci.yml`)

**Triggers:**
- Push to `main` or `master` branch
- Pull requests to `main` or `master` branch

**Steps:**
1. Checkout code
2. Install Nix with flakes support
3. Install npm dependencies
4. Run linter (`npm run lint`)
5. Run tests (`npm test`)
6. Build package (`npm run build`)
7. Generate coverage report
8. Upload coverage to Codecov (optional)

**Purpose:** Ensures all code changes pass tests and build successfully.

### Release Workflow (`release.yml`)

**Triggers:**
- Push of version tags matching `v*.*.*` (e.g., `v0.1.0`, `v1.2.3`)

**Steps:**
1. Checkout code
2. Install Nix with flakes support
3. Install dependencies
4. Run tests
5. Build package
6. Publish to npm registry
7. Create GitHub release with release notes

**Purpose:** Automates npm package publishing and GitHub releases.

## Setup Requirements

### For CI (Automated)

No setup required - works out of the box for all contributors.

### For Releases (Maintainers Only)

Repository secrets needed:

1. **`NPM_TOKEN`** (Required)
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Create a new "Automation" token with publish permissions
   - Add to repository: Settings → Secrets and variables → Actions → New repository secret
   - Name: `NPM_TOKEN`
   - Value: Your npm token

2. **`CODECOV_TOKEN`** (Optional)
   - Go to https://codecov.io and add your repository
   - Copy the upload token
   - Add as repository secret
   - Name: `CODECOV_TOKEN`

## Creating a Release

### Manual Process

1. Update version:
   ```bash
   npm version patch  # 0.1.0 -> 0.1.1
   # or
   npm version minor  # 0.1.0 -> 0.2.0
   # or
   npm version major  # 0.1.0 -> 1.0.0
   ```

2. Push with tags:
   ```bash
   git push origin main --tags
   ```

3. GitHub Actions will automatically:
   - Run all tests
   - Build the package
   - Publish to npm
   - Create GitHub release

### What Gets Published to npm

The `files` field in `package.json` specifies:
- `dist/` - Compiled JavaScript and type definitions
- `src/` - TypeScript source (for source maps)
- `README.md` - Documentation
- `LICENSE` - License file

Files excluded by `.npmignore`:
- Tests (`tests/`, `*.test.ts`)
- Build configuration (`tsconfig.json`, `vitest.config.ts`)
- Development files (`.direnv/`, `flake.nix`)
- Git and CI files (`.git/`, `.github/`)

## Monitoring Workflows

- View workflow runs: https://github.com/YOUR_USERNAME/dits/actions
- Check npm package: https://www.npmjs.com/package/dits
- View releases: https://github.com/YOUR_USERNAME/dits/releases

## Troubleshooting

**Build fails in CI:**
- Check if tests pass locally: `npm test`
- Check if build succeeds locally: `npm run build`
- Check if linter passes: `npm run lint`

**Release fails to publish to npm:**
- Verify `NPM_TOKEN` secret is set correctly
- Check token has publish permissions
- Ensure package version hasn't been published already
- Check npm registry status: https://status.npmjs.org

**Coverage upload fails:**
- Non-critical - workflow will continue
- Check if `CODECOV_TOKEN` is set (optional)
- Verify Codecov repository integration

## Badge Status

Add to README.md:

```markdown
[![CI](https://github.com/YOUR_USERNAME/dits/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/dits/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/dits.svg)](https://www.npmjs.com/package/dits)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/dits/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/dits)
```

Replace `YOUR_USERNAME` with your actual GitHub username.
