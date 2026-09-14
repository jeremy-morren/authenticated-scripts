# Authenticated Scripts for Azure DevOps

Use a [service connection][serviceConnection] with scripts instead of pasting secrets into variables!

### ❗ *Important note on using Service Connections* ❗

Please note that these tasks are built to only use `Generic` Service Connections. No other connections will be displayed when configuring these tasks.

## Features

* ✅ Supply Generic Service Connection to shell:
  - `Powershell core` (`pwsh`)
  - `bash` (linux & macOS only)
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

`scriptPath` accepts `parameters`, which are passed to the script.

Supported `scriptType` values are `pwsh` (default), `powershell`, `batch`, and `bash`. `batch` and `powershell` are only available on Windows agents; `bash` is only available on Linux and macOS agents.

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

This creates `PARTNER_API_URL`, `PARTNER_API_USERNAME`, and `PARTNER_API_PASSWORD`. Username and password are marked secret and are masked in task output.

```yaml
- task: AuthenticatedScripts@2
  inputs:
    serviceConnection: my-generic-service
    scriptLocation: createVariables
    variablePrefix: PARTNER_API

- bash: curl --user "$(PARTNER_API_USERNAME):$(PARTNER_API_PASSWORD)" "$(PARTNER_API_URL)/health"
```

Variables are job-scoped hence only available to subsequent steps in the same job.

## Acknowledgements

This task is heavily inspired by [cloudpups/authenticated-scripts](https://github.com/cloudpups/authenticated-scripts), with ergonomic improvements and update to `Node_24` runtime.

## EULA

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[serviceConnection]: https://learn.microsoft.com/en-us/azure/devops/pipelines/library/service-endpoints

