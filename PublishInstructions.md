# Publishing Authenticated Scripts publicly

## One-time Marketplace setup

1. Sign in to the [Visual Studio Marketplace publisher management portal](https://marketplace.visualstudio.com/manage) with the Microsoft account or Microsoft Entra account that will own the extension.
2. The extension is published under the publisher ID `jeremy-morren`, which must match `publisher` in `vss-extension.json`. The publisher ID is part of the extension identity and cannot be casually changed after users install the extension.
3. Create a Personal Access Token (PAT) for the same account with the **Marketplace (Publish)** scope. Microsoft documents the supported authentication options in [Publish an Azure DevOps extension from the command line](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line?view=azure-devops).
4. In the GitHub repository, open **Settings → Secrets and variables → Actions**, create the repository secret named `PUBLISH_TOKEN`, and paste the PAT. No other repository secret or variable is required by the workflow.

## Releasing a version

1. Run `npm ci`, `npm test`, and `npm run package` locally, then push your changes.
2. Every push starts `.github/workflows/build.yml`. It patches source versions, runs tests on Linux and Windows, verifies reproducible packaging, and replaces any existing draft for that version with a new draft GitHub release with `authenticated-scripts.vsix` attached. The draft targets the pushed commit.
3. Review the draft and publish it in GitHub Releases. You do not need to create or push a version tag yourself. The `release: published` event starts `.github/workflows/publish.yml`, which downloads that release's VSIX and publishes it to Azure DevOps Marketplace. It does not rebuild or change versions. Both workflow files must be present on the default branch for the release event workflow to operate.

## First Marketplace listing

1. Confirm the publisher profile, extension manifest, README, license, support route, and privacy information are ready for customers.
2. After the first Marketplace publish, share the extension with your Azure DevOps organization through the Marketplace management portal, install it, and run an end-to-end pipeline.
3. Share the extension with initial organizations for validation, then make the listing public when it meets Marketplace requirements.

Microsoft's [Package and publish extensions](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops) guide describes publisher setup, private sharing, installation, and public listing requirements.

## Rotating the publishing token

Create a replacement PAT with Marketplace (Publish) scope, update the GitHub `PUBLISH_TOKEN` secret, verify a publish from a reviewed draft release, and then revoke the old PAT.

## Versioning and retries

CI takes major/minor from `tasks/AuthenticatedScripts/task.json` and sets patch to one above the highest matching published GitHub release, excluding drafts. A new version line starts at patch 1; patch 0 marks unpatched source and is rejected by CI builds. Nonnumeric version tags are ignored. Drafts do not reserve versions. Ensure existing Marketplace versions have corresponding published GitHub releases.

Before building, `npm run patch:task` updates `tasks/AuthenticatedScripts/task.json` and `vss-extension.json` in the checkout using the GitHub CLI. These changes are not committed. Build, packaging, and publishing consume the patched versions without modifying them. To patch locally, install `gh`, sign in with `gh auth login`, and run `npm run patch:task`. The CLI discovers the current repository; `GH_REPO=owner/repo` overrides it.

Push workflows are serialized across the repository from testing through draft creation, and queued pushes wait for their turn. Each successful run deletes any existing draft for the calculated version and creates a replacement targeting the pushed commit. Published releases are never deleted. Until that version is published, subsequent pushes and reruns reuse the same version and replace its draft. The publishing workflow is separately serialized and can be rerun against the same release artifact if publishing fails. Publish drafts in version order, since Marketplace versions must advance.

The workflow's GitHub token has contents write permission for draft discovery and creation; the publishing workflow only needs contents read plus `PUBLISH_TOKEN`. No release is published automatically by the push workflow.

Local packages are written to `dist/authenticated-scripts.vsix`; older VSIX files in `dist` do not affect packaging. Tool versions are declared in `package.json`: `engines.node`, `engines.npm`, and `devDependencies.tfx-cli`. Both workflows use `.github/actions/setup-toolchain` to install those versions. The publishing workflow checks out the release configuration to use this action, but does not build the task. Keep `.nvmrc`, `packageManager`, and the lockfile consistent when updating the toolchain; the shared action verifies the local version metadata.
