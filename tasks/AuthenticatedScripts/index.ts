import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import tl = require('azure-pipelines-task-lib/task');
import { commandForScript, isSingleLine, resolveScriptSource, serviceConnectionEnvironment, ScriptLocation, SCRIPT_TYPES, ScriptType, variableNames, ShorthandInputs } from './logic';

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
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

function echoIfSingleLine(contents: string): void {
  if (isSingleLine(contents)) {
    console.log('Script contents:');
    console.log(contents);
  }
}

/** Gets all shorthand script inputs. */
function shorthandInputs(): ShorthandInputs {
  const entries = SCRIPT_TYPES.map(type => [type, tl.getInput(type, false)]);
  return Object.fromEntries(entries) as ShorthandInputs;
}

function warnIgnoredScriptInputs(): void {
  const values = {
    inlineScript: tl.getInput('inlineScript', false),
    scriptFile: tl.getInput('scriptFile', false),
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
    tl.getInput('scriptFile', false),
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
  if (type === 'bash' && process.platform === 'win32') {
    throw new Error("scriptType 'bash' is not supported on Windows agents.");
  }

  const cwd = tl.getVariable('System.DefaultWorkingDirectory') || process.cwd();
  let temporaryFile: string | undefined;
  try {
    let scriptFile: string;
    if (location === 'scriptPath') {
      scriptFile = path.resolve(cwd, source.value || tl.getInputRequired('scriptFile'));
      if (!fs.existsSync(scriptFile) || !fs.statSync(scriptFile).isFile()) {
        throw new Error(`Script file does not exist: ${scriptFile}`);
      }
      echoIfSingleLine(fs.readFileSync(scriptFile, 'utf8'));
    } else {
      const contents = source.value || tl.getInputRequired('inlineScript');
      echoIfSingleLine(contents);
      temporaryFile = temporaryScriptFile(type, contents);
      scriptFile = temporaryFile;
    }

    const spec = commandForScript(type, scriptFile);
    const runner = tl.tool(tl.which(spec.command, true));
    runner.arg(spec.args);
    if (location === 'scriptPath' && parameters) {
      runner.line(parameters);
    }

    const result = await runner.execAsync({
      cwd,
      ignoreReturnCode: true,
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
