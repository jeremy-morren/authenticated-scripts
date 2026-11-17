# Authenticated Scripts for Azure DevOps

[![GitHub repository](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/jeremy-morren/authenticated-scripts)
[![Build](https://img.shields.io/github/actions/workflow/status/jeremy-morren/authenticated-scripts/build.yml?label=Build)](https://github.com/jeremy-morren/authenticated-scripts/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/jeremy-morren/authenticated-scripts/publish.yml?label=Release)](https://github.com/jeremy-morren/authenticated-scripts/actions/workflows/publish.yml)

An Azure DevOps extension that lets a pipeline step use the URL, username, and password from a Generic service connection without placing those credentials in YAML. `AuthenticatedScripts@2` supports `pwsh`, `bash`, `powershell.exe`, and `batch` (`cmd.exe`).

## Installation

Install the task from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jeremy-morren.authenticatedscripts).

Use a [service connection][serviceConnection] with scripts instead of pasting secrets into variables!

### ❗ *Important note on using Service Connections* ❗

Please note that these tasks are built to only use `Generic` Service Connections. No other connections will be displayed when configuring these tasks.

See [authenticated-scripts](https://github.com/jeremy-morren/authenticated-scripts) for the task source.

## Features

* ✅ Supply Generic Service Connection to shell:
  - `Powershell core` (`pwsh`)
  - `bash` (all platforms, same as `Bash@3`. On Windows uses `bash` from `PATH`, usually Git Bash)
  - `powershell` (`powershell.exe`, Windows only)
  - `batch` (`cmd.exe`, Windows only)
* ✅ Shorthand syntax for clean yaml
* ✅ Expose variables mode for using service connection as shared secret

## Usage

In `scriptPath` and `inlineScript` modes, the task makes these environment variables available to the child script:

| Variable         | Generic service-connection field |
| ---------------- | -------------------------------- |
| `AS_SC_URL`      | URL                              |
| `AS_SC_USERNAME` | Username                         |
| `AS_SC_PASSWORD` | Password                         |

Please note that this task does **not** persist the environment variables for longer than the execution of the script itself.

```yaml
# Using shorthand
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    bash: curl "$AS_SC_URL" --user "$AS_SC_USER:$AS_SC_PASSWORD"

# Using scriptLocation + scriptType
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    scriptLocation: inlineScript
    scriptType: pwsh
    inlineScript: |
      $password = ConvertTo-SecureString $env:AS_SC_PASSWORD -AsPlainText -Force
      $credential = [pscredential]::new($env:AS_SC_USERNAME, $password)
      Invoke-RestMethod -Uri $env:AS_SC_URL -Credential $credential
      
```

Explicit and shorthand script paths are resolved against the pipeline working directory. Service connection fields are passed through without validation; null or undefined values become empty strings.

`scriptPath` accepts `parameters`, which are passed to the script. For `bash`, like the built-in Bash@3 task, the script runs as `exec bash '<scriptFile>' <parameters>`, so bash parses the parameters: quoting, `$VARIABLE` expansion (including `$AS_SC_*`), and command substitution all work.

Supported `scriptType` values are `pwsh` (default), `powershell`, `batch`, and `bash`. `batch` and `powershell` are only available on Windows agents. Like Bash@3, `bash` runs on every agent and uses the first `bash` on `PATH`, translating script paths on Windows. On Windows, Git Bash is preferred over WSL's `bash.exe`, which would not receive the `AS_SC_*` variables.

## YAML shorthands

For YAML-first pipelines, `pwsh`, `powershell`, `batch`, and `bash` can replace `inlineScript` or `scriptFile`. Specify at most one shorthand.

```yaml
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    bash: echo "Calling $AS_SC_URL"
```

is the equivalent of
```yaml
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    scriptType: bash
    inlineScript: echo "Calling $AS_SC_URL"
```

You can also use it with `scriptLocation: scriptPath`:

```yaml
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    scriptLocation: scriptPath
    powershell: scripts/call-service.ps1
    parameters: -Verbose
```

If `scriptType` is provided, it must match the provided shorthand.

## Create pipeline variables

To simply expose the service connection as job variables, use the `scriptLocation: createVariables`.

This creates `SERVICE_API_URL`, `SERVICE_API_USERNAME`, and `SERVICE_API_PASSWORD`. Username and password are marked secret and are masked in task output.

```yaml
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    scriptLocation: createVariables
    variablePrefix: SERVICE_API

# SERVICE_API_URL, SERVICE_API_USERNAME and SERVICE_API_PASSWORD 
# are now available as job secrets
- bash: curl "$SERVICE_API_URL" --user "$HTTP_USER"
  env:
    HTTP_USER: $(SERVICE_API_USERNAME):$(SERVICE_API_PASSWORD)
```

Variables are job-scoped hence only available to subsequent steps in the same job.

## Acknowledgements

This task is heavily inspired by [cloudpups/authenticated-scripts](https://github.com/cloudpups/authenticated-scripts), with ergonomic improvements and update to `Node_24` runtime.

## License

This task is available under the [MIT](https://github.com/jeremy-morren/authenticated-scripts/blob/main/LICENSE.txt) license.