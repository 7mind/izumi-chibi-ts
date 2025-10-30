# Contributing to distage

Thank you for your interest in contributing to distage!

## Development Setup

This project uses Nix for development environment management:

```bash
# Enter development environment
nix develop

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Check types (linting)
npm run lint

# Build the project
npm run build
```

## Running Tests

All tests must pass before submitting a PR:

```bash
npm test
```

## Code Style

- Use TypeScript with strict mode enabled
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes with descriptive messages
6. Push to your fork: `git push origin my-feature`
7. Open a Pull Request

## Release Process

Releases are automated through GitHub Actions. To create a new release:

1. **Update version** in `package.json`:
   ```bash
   npm version patch  # for bug fixes (0.1.0 -> 0.1.1)
   npm version minor  # for new features (0.1.0 -> 0.2.0)
   npm version major  # for breaking changes (0.1.0 -> 1.0.0)
   ```

2. **Push the tag**:
   ```bash
   git push origin main --tags
   ```

3. **Automated workflow**:
   - GitHub Actions will automatically:
     - Run all tests
     - Build the package
     - Publish to npm
     - Create a GitHub release

### Prerequisites for Releases

To publish releases, repository maintainers need to set up:

1. **NPM_TOKEN**: npm authentication token
   - Create at https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Add as repository secret at: Settings → Secrets → Actions → New repository secret
   - Name: `NPM_TOKEN`

2. **CODECOV_TOKEN** (optional for coverage reports):
   - Create at https://codecov.io
   - Add as repository secret
   - Name: `CODECOV_TOKEN`

## CI/CD

The project uses GitHub Actions for continuous integration:

- **CI Workflow** (`.github/workflows/ci.yml`):
  - Runs on every push and pull request
  - Executes tests, linting, and builds
  - Uploads coverage reports

- **Release Workflow** (`.github/workflows/release.yml`):
  - Triggered on version tags (v*.*.*)
  - Publishes to npm
  - Creates GitHub releases

## Project Structure

```
distage/
├── src/
│   ├── core/         # Core DI engine (Planner, Producer, Injector)
│   ├── dsl/          # Fluent API (ModuleDef)
│   └── model/        # Data models (DIKey, Binding, Activation)
├── tests/            # Test files
├── dist/             # Build output (generated)
└── flake.nix         # Nix development environment
```

## Architecture

distage follows distage's architecture:

1. **ModuleDef** - DSL for defining bindings
2. **Planner** - Analyzes dependency graph, detects issues
3. **Producer** - Instantiates objects based on plan
4. **Locator** - Provides type-safe access to instances
5. **Injector** - Main entry point

## Questions?

Feel free to open an issue for any questions or concerns!
