# Contributing

Pull requests and issues are welcome.

## Development

```sh
nvm install
nvm use
npm ci
npm test
npm run verify:reproducible
npm run package
```

`nvm install`/`nvm use` read the pinned version from `.nvmrc`; install [nvm](https://github.com/nvm-sh/nvm) (or [nvm-windows](https://github.com/coreybutler/nvm-windows)) if you don't already have a Node version manager. Use the Node.js and npm versions declared in `package.json` and run `npm ci`; the lockfile pins the complete dependency graph. The package process reassembles the VSIX with sorted entries and a fixed ZIP timestamp, and `verify:reproducible` asserts that two independent packages have the same SHA-256.

CI runs `npm run patch:task` before building to update the task and extension source versions from published GitHub releases, excluding drafts. Patch 0 marks unpatched source and is rejected by CI builds; local builds can use patch 0. Build, packaging, and publishing do not change manifest versions.

Pull requests run the tests on Linux and Windows and report the results in the job summary and a pull request comment. Every push to `main` also runs packaging, then replaces any existing draft for the calculated version with a new draft containing the VSIX. Publishing that draft triggers a separate workflow that publishes the attached VSIX to Azure DevOps Marketplace without rebuilding it.

Both workflows use `.github/actions/setup-toolchain` to read Node.js and npm versions from `package.json` (`engines`) and the publishing CLI version from `devDependencies.tfx-cli`. When changing Node.js, keep `.nvmrc` in sync for local version managers; when changing npm, keep `packageManager` in sync. The shared action checks these values. Refresh `package-lock.json` after changing package metadata.


## Releasing a version

1. Run `npm ci`, `npm test`, and `npm run package` locally, then push your changes.
2. Every push to `main` starts `.github/workflows/build.yml`. It patches source versions, runs tests on Linux and Windows, verifies reproducible packaging, and replaces any existing draft for that version with a new draft GitHub release with `authenticated-scripts-v<version>.vsix` attached. The draft targets the pushed commit.
3. Review the draft and publish it in GitHub Releases. You do not need to create or push a version tag yourself. The `release: published` event starts `.github/workflows/publish.yml`, which downloads that release's VSIX and publishes it to Azure DevOps Marketplace. It does not rebuild or change versions. Both workflow files must be present on the default branch for the release event workflow to operate.

## Versioning and retries

CI takes major/minor from `tasks/AuthenticatedScripts/task.json` and sets patch to one above the highest matching published GitHub release, excluding drafts. A new version line starts at patch 1; patch 0 marks unpatched source and is rejected by CI builds. Nonnumeric version tags are ignored. Drafts do not reserve versions. Ensure existing Marketplace versions have corresponding published GitHub releases.

Before building, `npm run patch:task` updates `tasks/AuthenticatedScripts/task.json` and `vss-extension.json` in the checkout using the GitHub CLI. These changes are not committed. Build, packaging, and publishing consume the patched versions without modifying them. To patch locally, install `gh`, sign in with `gh auth login`, and run `npm run patch:task`. The CLI discovers the current repository; `GH_REPO=owner/repo` overrides it.

Workflows for pushes to `main` are serialized across the repository from testing through draft creation, and queued pushes wait for their turn. Pull request runs queue separately per pull request and never create releases. Each successful run deletes any existing draft for the calculated version and creates a replacement targeting the pushed commit. Published releases are never deleted. Until that version is published, subsequent pushes and reruns reuse the same version and replace its draft. The publishing workflow is separately serialized and can be rerun against the same release artifact if publishing fails. Publish drafts in version order, since Marketplace versions must advance.

Only the draft-release job's GitHub token has contents write permission, for draft discovery and creation; test jobs are read-only, and the test-results job can only write checks and pull request comments. The publishing workflow only needs contents read plus `PUBLISH_TOKEN`. No release is published automatically by the push workflow.

Local packages are written to `dist/authenticated-scripts-v<version>.vsix`, using the version in `vss-extension.json`; older VSIX files in `dist` do not affect packaging. Tool versions are declared in `package.json`: `engines.node`, `engines.npm`, and `devDependencies.tfx-cli`. Both workflows use `.github/actions/setup-toolchain` to install those versions. The publishing workflow checks out the release configuration to use this action, but does not build the task. Keep `.nvmrc`, `packageManager`, and the lockfile consistent when updating the toolchain; the shared action verifies the local version metadata.
