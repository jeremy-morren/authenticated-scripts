# Authenticated Scripts for Azure DevOps

[![Build](https://img.shields.io/github/actions/workflow/status/jeremy-morren/authenticated-scripts/build.yml?label=Build)](https://github.com/jeremy-morren/authenticated-scripts/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/jeremy-morren/authenticated-scripts/publish.yml?label=Release)](https://github.com/jeremy-morren/authenticated-scripts/actions/workflows/publish.yml)

An Azure DevOps extension that lets a pipeline step use the URL, username, and password from a Generic service connection without placing those credentials in YAML. `AuthenticatedScripts@2` supports `pwsh`, `bash`, `powershell.exe`, and `batch` (`cmd.exe`).

## Installation

Install the task from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jeremy-morren.authenticatedscripts).

## Overview

See the [Overview document](./docs/Overview.md).

## Acknowledgements

This task is heavily inspired by [cloudpups/authenticated-scripts](https://github.com/cloudpups/authenticated-scripts), with ergonomic improvements and update to `Node_24` runtime.