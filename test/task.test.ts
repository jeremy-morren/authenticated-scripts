import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const bundle = path.resolve('tasks/AuthenticatedScripts/dist/index.js');

function runTask(directory: string, inputs: Record<string, string | undefined>) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(INPUT_|ENDPOINT_|SECRET_|VSTS_TASKVARIABLE_)/i.test(key)) delete env[key];
  }
  return spawnSync(process.execPath, [bundle], {
    encoding: 'utf8',
    env: {
      ...env,
      AGENT_TEMPDIRECTORY: directory,
      SYSTEM_DEFAULTWORKINGDIRECTORY: directory,
      ENDPOINT_URL_TEST: 'https://example.test',
      ENDPOINT_AUTH_PARAMETER_TEST_USERNAME: 'alice',
      ENDPOINT_AUTH_PARAMETER_TEST_PASSWORD: 'secret',
      ...inputs
    }
  });
}

test('bundled task reports a readable missing-input error', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-task-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = runTask(directory, { INPUT_SCRIPTLOCATION: 'createVariables', INPUT_VARIABLEPREFIX: 'TEST' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /task.complete result=Failed/);
  assert.match(result.stdout, /Input required: serviceConnection/);
  assert.doesNotMatch(result.stdout + result.stderr, /LIB_InputRequired|Resource file not set|Unable to find loc string/);
});

test('missing and empty connection fields are passed through in scripts and pipeline variables', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'optional-connection-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const fields of [
    { url: undefined, username: undefined, password: undefined },
    { url: '', username: '', password: '' },
    { url: 'not-a-url', username: 'alice', password: undefined }
  ]) {
    const inputs = {
      INPUT_SERVICECONNECTION: 'TEST',
      ENDPOINT_URL_TEST: fields.url,
      ENDPOINT_AUTH_PARAMETER_TEST_USERNAME: fields.username,
      ENDPOINT_AUTH_PARAMETER_TEST_PASSWORD: fields.password
    };
    const windows = process.platform === 'win32';
    const script = runTask(directory, {
      ...inputs,
      INPUT_SCRIPTTYPE: windows ? 'batch' : 'bash',
      INPUT_INLINESCRIPT: windows
        ? '@echo off\r\necho FIELDS=[%AS_SC_URL%]/[%AS_SC_USERNAME%]/[%AS_SC_PASSWORD%]\r\n'
        : 'echo "FIELDS=[$AS_SC_URL]/[$AS_SC_USERNAME]/[$AS_SC_PASSWORD]"\n'
    });
    assert.equal(script.status, 0, script.stderr);
    assert.match(script.stdout, /task.complete result=Succeeded/);
    assert.ok(script.stdout.includes(`FIELDS=[${fields.url ?? ''}]/[${fields.username ?? ''}]/[${fields.password ?? ''}]`), script.stdout);

    const variables = runTask(directory, {
      ...inputs, INPUT_SCRIPTLOCATION: 'createVariables', INPUT_VARIABLEPREFIX: 'TEST'
    });
    assert.equal(variables.status, 0, variables.stderr);
    assert.match(variables.stdout, /task.complete result=Succeeded/);
    for (const [field, value] of Object.entries(fields)) {
      const secret = field !== 'url';
      const command = `##vso[task.setvariable variable=TEST_${field.toUpperCase()};isOutput=false;issecret=${secret};]${value ?? ''}`;
      assert.ok(variables.stdout.split(/\r?\n/).includes(command), variables.stdout);
    }
  }
});

test('batch executes ordinary and spaced relative paths with spaced arguments for both input styles', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'batch task '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of ['test.cmd', 'script with spaces.cmd']) {
    fs.writeFileSync(path.join(directory, file), '@echo off\r\necho ARG=[%~1]\r\necho USER=[%AS_SC_USERNAME%]\r\n');
    for (const shorthand of [false, true]) {
      const result = runTask(directory, {
        INPUT_SERVICECONNECTION: 'TEST',
        INPUT_SCRIPTLOCATION: 'scriptPath',
        INPUT_SCRIPTTYPE: 'batch',
        INPUT_PARAMETERS: '"hello world"',
        [shorthand ? 'INPUT_BATCH' : 'INPUT_SCRIPTFILE']: file
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /task.complete result=Succeeded/);
      assert.match(result.stdout, /ARG=\[hello world\]/);
      assert.match(result.stdout, /USER=\[alice\]/);
    }
  }
});

test('inline files are removed after success, script failure, and credential failure', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-task-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const scenario of ['success', 'script failure', 'credential failure']) {
    const windows = process.platform === 'win32';
    const result = runTask(directory, {
      INPUT_SERVICECONNECTION: scenario === 'credential failure' ? '' : 'TEST',
      INPUT_SCRIPTTYPE: windows ? 'batch' : 'bash',
      INPUT_INLINESCRIPT: `${windows ? '@echo off\r\nexit /b' : 'exit'} ${scenario === 'script failure' ? 7 : 0}`
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, scenario === 'success' ? /task.complete result=Succeeded/ : /task.complete result=Failed/);
    assert.deepEqual(fs.readdirSync(directory).filter(file => file.startsWith('authenticated-scripts-')), []);
  }
});

test('the agent default for an unset scriptFile is treated as unset', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'default-path-task-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const type = process.platform === 'win32' ? 'batch' : 'bash';
  const agentDefaults = { INPUT_SERVICECONNECTION: 'TEST', BUILD_SOURCESDIRECTORY: directory, INPUT_SCRIPTFILE: directory };

  const shorthand = runTask(directory, { ...agentDefaults, [`INPUT_${type.toUpperCase()}`]: 'echo SHORTHAND=[ran]' });
  assert.equal(shorthand.status, 0, shorthand.stderr);
  assert.match(shorthand.stdout, /task.complete result=Succeeded/);
  assert.match(shorthand.stdout, /SHORTHAND=\[ran\]/);

  const variables = runTask(directory, { ...agentDefaults, INPUT_SCRIPTLOCATION: 'createVariables', INPUT_VARIABLEPREFIX: 'TEST' });
  assert.match(variables.stdout, /task.complete result=Succeeded/);
  assert.doesNotMatch(variables.stdout, /Ignoring script-only input/);

  const scriptPath = runTask(directory, { ...agentDefaults, INPUT_SCRIPTLOCATION: 'scriptPath', INPUT_SCRIPTTYPE: type });
  assert.match(scriptPath.stdout, /task.complete result=Failed/);
  assert.match(scriptPath.stdout, /Input required: scriptFile/);
});

test('explicit and shorthand missing paths use the same validation', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-task-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const type = process.platform === 'win32' ? 'batch' : 'bash';
  for (const key of ['INPUT_SCRIPTFILE', `INPUT_${type.toUpperCase()}`]) {
    const result = runTask(directory, {
      INPUT_SERVICECONNECTION: 'TEST', INPUT_SCRIPTLOCATION: 'scriptPath', INPUT_SCRIPTTYPE: type,
      [key]: 'missing-file'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /task.complete result=Failed/);
    assert.match(result.stdout, /Script file does not exist:/);
  }
});
