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

`nvm install`/`nvm use` read the pinned version from `.nvmrc`; install [nvm](https://github.com/nvm-sh/nvm) (or [nvm-windows](https://github.com/coreybutler/nvm-windows)) if you don't already have a Node version manager. Use the Node.js and npm versions declared in `package.json` and run `npm ci`; the lockfile pins the complete dependency graph. The package process reassembles the VSIX with sorted entries and a fixed ZIP timestamp, and `verify:reproducible` asserts that two independent packages have the same SHA-256. See [PublishInstructions.md](PublishInstructions.md) for Marketplace setup and GitHub Actions publishing.

CI runs `npm run patch:task` before building to update the task and extension source versions from published GitHub releases, excluding drafts. Patch 0 marks unpatched source and is rejected by CI builds; local builds can use patch 0. Build, packaging, and publishing do not change manifest versions.

Every push runs tests and packaging, then replaces any existing draft for the calculated version with a new draft containing the VSIX. Publishing that draft triggers a separate workflow that publishes the attached VSIX to Azure DevOps Marketplace without rebuilding it.

Both workflows use `.github/actions/setup-toolchain` to read Node.js and npm versions from `package.json` (`engines`) and the publishing CLI version from `devDependencies.tfx-cli`. When changing Node.js, keep `.nvmrc` in sync for local version managers; when changing npm, keep `packageManager` in sync. The shared action checks these values. Refresh `package-lock.json` after changing package metadata.