import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import tl = require('azure-pipelines-task-lib/task');
import { bashWrapperScript, commandForScript, gitBashCandidates, isSingleLine, isWslBash, resolveScriptSource, serviceConnectionEnvironment, ScriptLocation, SCRIPT_TYPES, ScriptType, variableNames, ShorthandInputs } from './logic';

const SCRIPT_LOCATIONS: ReadonlySet<string> = new Set(['scriptPath', 'inlineScript', 'createVariables']);

function getConnection() {
  const endpointId = tl.getInputRequired('serviceConnection');
  return {
    url: tl.getEndpointUrl(endpointId, true) ?? '',
    username: tl.getEndpointAuthorizationParameter(endpointId, 'username', true) ?? '',
    password: tl.getEndpointAuthorizationParameter(endpointId, 'password', true) ?? ''
  };
}

function writeConnectionVariables(prefix: string): void {
  const connection = getConnection();
  const names = variableNames(prefix);
  tl.setVariable(names.url, connection.url, false);
  tl.setVariable(names.username, connection.username, true);
  tl.setVariable(names.password, connection.password, true);
  console.log(`${names.url} = ${connection.url}`);
  console.log(`${names.username} = ***`);
  console.log(`${names.password} = ***`);
}

function temporaryScriptFile(type: ScriptType, contents: string): string {
  const extension = type === 'bash' ? '.sh' : type === 'batch' ? '.cmd' : '.ps1';
  const file = path.join(tl.getVariable('Agent.TempDirectory') || os.tmpdir(), `authenticated-scripts-${randomUUID()}${extension}`);
  // Like CmdLineV2, allow scripts to enable echo again rather than using cmd /Q.
  const script = type === 'batch' ? `@echo off\r\n${contents.replace(/\r?\n/g, '\r\n')}` : contents;
  fs.writeFileSync(file, script, 'utf8');
  return file;
}

/**
 * Like Bash@3, uses the first bash on PATH, except that on Windows Git Bash is preferred over WSL's bash,
 * which would not receive the AS_SC_* environment variables.
 */
function resolveBash(): string {
  const bash = tl.which('bash', false);
  if (process.platform === 'win32' && (!bash || isWslBash(bash))) {
    const gitBash = gitBashCandidates(tl.which('git', false) || undefined, process.env).find(file => fs.existsSync(file));
    if (gitBash) {
      if (bash) console.log(`Using Git Bash (${gitBash}) instead of WSL bash (${bash}).`);
      return gitBash;
    }
    if (bash) {
      tl.warning(`Git Bash was not found, so using WSL bash (${bash}). WSL does not receive AS_SC_* environment variables unless they are listed in WSLENV.`);
    }
  }
  return bash || tl.which('bash', true);
}

/** Runs `bash -c pwd` in a directory to learn bash's own path for it, e.g. /c/work for Git Bash or /mnt/c/work for WSL. */
async function bashDirectory(bash: string, directory: string): Promise<string> {
  let output = '';
  const pwd = tl.tool(bash).arg('-c').arg('pwd');
  pwd.on('stdout', (data: Buffer) => output += data.toString());
  await pwd.execAsync({ cwd: directory, silent: true });
  output = output.trim();
  if (!output) throw new Error(`Unable to translate the path '${directory}' for bash.`);
  return output;
}

/** Like Bash@3, translates a Windows file path into the path bash sees; other platforms are unchanged. */
async function bashFilePath(bash: string, file: string): Promise<string> {
  if (process.platform !== 'win32') return file;
  const directory = path.dirname(file);
  const translated = await bashDirectory(bash, directory);
  // A bash that cannot see the directory (e.g. WSL without the drive mounted) reports the same fallback for every path.
  const parent = path.dirname(directory);
  if (parent !== directory && translated === await bashDirectory(bash, parent)) {
    throw new Error(`Unable to translate the path '${directory}' for bash.`);
  }
  return `${translated}/${path.basename(file)}`;
}

function echoIfSingleLine(contents: string): void {
  if (isSingleLine(contents)) {
    console.log('Script contents:');
    console.log(contents);
  }
}

/** The agent fills an unset filePath input with the sources directory, so treat that value as unset. */
function scriptFileInput(): string | undefined {
  return tl.filePathSupplied('scriptFile') ? tl.getInput('scriptFile', false) : undefined;
}

/** Gets all shorthand script inputs. */
function shorthandInputs(): ShorthandInputs {
  const entries = SCRIPT_TYPES.map(type => [type, tl.getInput(type, false)]);
  return Object.fromEntries(entries) as ShorthandInputs;
}

function warnIgnoredScriptInputs(): void {
  const values = {
    inlineScript: tl.getInput('inlineScript', false),
    scriptFile: scriptFileInput(),
    parameters: tl.getInput('parameters', false),
    ...shorthandInputs()
  };
  const ignored = Object.entries(values).filter(([, value]) => Boolean(value)).map(([name]) => name);
  if (ignored.length) {
    tl.warning(`Ignoring script-only input(s) because scriptLocation is createVariables: ${ignored.join(', ')}.`);
  }
}

async function runScript(location: Exclude<ScriptLocation, 'createVariables'>): Promise<void> {
  const parameters = tl.getInput('parameters', false) || '';
  const source = resolveScriptSource(
    location,
    tl.getInput('scriptType', false),
    scriptFileInput(),
    tl.getInput('inlineScript', false),
    shorthandInputs()
  );
  const type = source.type;
  if (type === 'batch' && process.platform !== 'win32') {
    throw new Error("scriptType 'batch' is supported only on Windows agents.");
  }
  if (type === 'powershell' && process.platform !== 'win32') {
    throw new Error("scriptType 'powershell' is supported only on Windows agents.");
  }

  const cwd = tl.getVariable('System.DefaultWorkingDirectory') || process.cwd();
  const bash = type === 'bash' ? resolveBash() : undefined;
  let temporaryFile: string | undefined;
  try {
    let scriptFile: string;
    if (location === 'scriptPath') {
      if (!source.value) {
        throw new Error('Input required: scriptFile');
      }
      scriptFile = path.resolve(cwd, source.value);
      if (!fs.existsSync(scriptFile) || !fs.statSync(scriptFile).isFile()) {
        throw new Error(`Script file does not exist: ${scriptFile}`);
      }
      echoIfSingleLine(fs.readFileSync(scriptFile, 'utf8'));
      if (type === 'batch') {
        temporaryFile = temporaryScriptFile(type, `CALL "${scriptFile}"${parameters ? ` ${parameters}` : ''}`);
        scriptFile = temporaryFile;
      } else if (bash) {
        const contents = bashWrapperScript(await bashFilePath(bash, scriptFile), parameters);
        console.log(`Formatted command: ${contents}`);
        temporaryFile = temporaryScriptFile(type, contents);
        scriptFile = temporaryFile;
      }
    } else {
      const contents = source.value || tl.getInputRequired('inlineScript');
      echoIfSingleLine(contents);
      temporaryFile = temporaryScriptFile(type, contents);
      scriptFile = temporaryFile;
    }

    const spec = commandForScript(type, bash ? await bashFilePath(bash, scriptFile) : scriptFile);
    const runner = tl.tool(bash ?? tl.which(spec.command, true));
    runner.arg(spec.args);
    // Batch and bash pass parameters through their wrapper scripts; PowerShell takes them on the command line.
    if (location === 'scriptPath' && parameters && (type === 'pwsh' || type === 'powershell')) {
      runner.line(parameters);
    }

    const result = await runner.execAsync({
      cwd,
      ignoreReturnCode: true,
      windowsVerbatimArguments: type === 'batch',
      env: { ...process.env, ...serviceConnectionEnvironment(getConnection()) },
      outStream: process.stdout,
      errStream: process.stderr
    });
    if (result !== 0) {
      throw new Error(`${type} exited with code ${result}.`);
    }
  } finally {
    if (temporaryFile) fs.rmSync(temporaryFile, { force: true });
  }
}

async function run(): Promise<void> {
  try {
    const location = (tl.getInput('scriptLocation', false) || 'inlineScript') as ScriptLocation;
    if (!SCRIPT_LOCATIONS.has(location)) {
      throw new Error(`Unsupported scriptLocation '${location}'.`);
    }
    if (location === 'createVariables') {
      warnIgnoredScriptInputs();
      writeConnectionVariables(tl.getInputRequired('variablePrefix'));
    } else {
      await runScript(location);
    }
    tl.setResult(tl.TaskResult.Succeeded, 'Authenticated Scripts completed successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.setResult(tl.TaskResult.Failed, message);
  }
}

void run();
