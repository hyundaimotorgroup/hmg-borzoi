# Contributing

Thank you for your interest in contributing.

We welcome contributions from anyone interested in helping improve the project.

Contributions may include:

- Bug reports
- Feature requests
- Documentation improvements
- Bug fixes
- New features
- Performance enhancements
- Test improvements
- Security and reliability improvements

All contributions are reviewed according to the project's technical, quality, security, and licensing requirements.

Please review this guide before creating an issue or submitting a pull request.

---

## Code of Conduct

This project is committed to providing a welcoming, inclusive, and respectful environment for all participants.

By participating in this project, you agree to follow the project's Code of Conduct.

For more information, see:

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## Before You Contribute

Before opening an issue or submitting a pull request:

1. Search existing issues and pull requests.
2. Confirm that the issue or proposal has not already been reported.
3. Verify that your contribution aligns with the project's goals and scope.
4. Read this guide before contributing.
5. Review the Contributor License Agreement (CLA).

---

## Reporting Bugs

If you discover a bug, please create a Bug Report using the provided issue template.

A good bug report should include:

- Clear problem description
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details
- Relevant logs or error messages
- Screenshots or recordings when applicable

---

## Requesting Features

Feature requests are welcome.

Before submitting a feature request:

- Clearly define the problem you are trying to solve
- Describe the proposed solution
- Explain why the feature is valuable
- Consider alternative solutions or approaches
- Provide practical use cases whenever possible

---

## Security Vulnerabilities

Do **NOT** report security vulnerabilities through public GitHub Issues, Discussions, or Pull Requests.

Instead, follow the reporting process described in:

- [SECURITY.md](SECURITY.md)

---

## Development Setup

### Prerequisites

- Git
- Node.js >= 20.x
- npm >= 10.x
- Docker (for local PostgreSQL)
- A running ClickHouse instance

### Clone the Repository

```bash
git clone https://github.com/hyundaimotorgroup/hmg-borzoi.git
cd hmg-borzoi
```

### Install Dependencies

```bash
npm ci
```

### Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your ClickHouse and PostgreSQL connection details
```

### Database Setup

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
npm run db:generate
npm run db:migrate
node scripts/create-app-user.js \
  --email you@example.com \
  --name "First User" \
  --password "change-me" \
  --role admin
```

### Run Development Server

```bash
npm run dev
```

### Build the Project

```bash
npm run build
```

### Run Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e
```

---

## Development Workflow

### 1. Fork the Repository

Create a personal fork of the repository.

### 2. Create a Branch

Create a branch from the default branch.

Examples:

```text
feature/query-profiling
fix/cluster-connection-timeout
docs/update-deployment-guide
```

### 3. Make Changes

Please ensure that your changes are:

- Focused and easy to review
- Consistent with existing design patterns
- Appropriately documented
- Accompanied by tests when applicable

Avoid including unrelated changes in the same pull request.

### 4. Validate Your Changes

Before creating a pull request:

```bash
npm run lint
npm run test
npm run test:e2e
```

### 5. Update Documentation

If your changes affect user-facing functionality, APIs, configuration, or workflows, update the relevant documentation as appropriate.

### 6. Submit a Pull Request

When opening a pull request:

- Complete the Pull Request template
- Provide a clear description of the change
- Explain the motivation and expected outcome
- Link related issues

Examples:

```text
Fixes #123
Closes #456
```

---

## Commit Message Guidelines

We recommend following the [Conventional Commits](https://www.conventionalcommits.org/) specification.

Format:

```text
<type>(optional-scope): short description
```

Examples:

```text
feat(query-editor): add query profiling panel

fix(cluster): handle connection timeout gracefully

docs(readme): update installation instructions
```

Common commit types:

- `feat` — New functionality
- `fix` — Bug fix
- `docs` — Documentation updates
- `refactor` — Internal code improvements
- `perf` — Performance improvements
- `test` — Test additions or changes
- `chore` — Maintenance work
- `ci` — CI/CD related updates

---

## Contributor License Agreement (CLA)

Contributions to this project are subject to a Contributor License Agreement (CLA).

Before contributing, please review:

- [CLA-KOR.md](https://github.com/hyundaimotorgroup/.github/blob/main/legal/CLA-KOR.md)
- [CLA-ENG.md](https://github.com/hyundaimotorgroup/.github/blob/main/legal/CLA-ENG.md)

By submitting a contribution, you confirm that you have the legal right to submit it and agree to the terms of the applicable CLA.

If CLA verification is enabled for this repository, contributors may be required to complete the CLA process before a pull request can be merged.

---

## Pull Request Review Process

All contributions are reviewed by project maintainers.

During review, maintainers may request:

- Additional testing
- Documentation updates
- Design clarification
- Security review
- Code improvements

Submission of a pull request does not guarantee acceptance.

---

## Questions and Support

Before creating a new issue, please search existing issues to avoid duplicates.

For bug reports and feature requests:
- GitHub Issues

For security concerns:
- Follow [SECURITY.md](SECURITY.md)

---

Thank you for contributing.
