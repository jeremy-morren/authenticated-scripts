import assert from 'node:assert/strict';
import test from 'node:test';
import { bashWrapperScript, commandForScript, gitBashCandidates, isSingleLine, isWslBash, resolveScriptSource, serviceConnectionEnvironment, variableNames } from '../tasks/AuthenticatedScripts/logic';

test('maps Generic service-connection fields to script environment variables', () => {
  assert.deepEqual(serviceConnectionEnvironment({ url: 'https://example.test', username: 'alice', password: 'secret' }), {
    AS_SC_URL: 'https://example.test',
    AS_SC_USERNAME: 'alice',
    AS_SC_PASSWORD: 'secret'
  });
});

test('uses the documented createVariables names', () => {
  assert.deepEqual(variableNames('MY_SERVICE'), {
    url: 'MY_SERVICE_URL',
    username: 'MY_SERVICE_USERNAME',
    password: 'MY_SERVICE_PASSWORD'
  });
});

test('recognises a single-line script', () => {
  assert.equal(isSingleLine('echo hello'), true);
  assert.equal(isSingleLine('echo hello\r\necho world'), false);
});

test('constructs the expected shell invocations', () => {
  assert.deepEqual(commandForScript('bash', '/tmp/test.sh'), { command: 'bash', args: ['/tmp/test.sh'] });
  assert.deepEqual(commandForScript('pwsh', 'test.ps1').args, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', 'test.ps1']);
  assert.deepEqual(commandForScript('batch', 'test.cmd'), {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/D', '/E:ON', '/V:OFF', '/S', '/C', '"CALL "test.cmd""']
  });
});

test('recognises WSL bash launchers and finds Git Bash beside git or in Program Files', () => {
  assert.equal(isWslBash('C:\\Windows\\system32\\bash.exe'), true);
  assert.equal(isWslBash('C:\\WINDOWS\\Sysnative\\bash.exe'), true);
  assert.equal(isWslBash('C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe'), true);
  assert.equal(isWslBash('C:\\Program Files\\Git\\bin\\bash.exe'), false);
  assert.equal(isWslBash('C:\\Program Files\\Git\\usr\\bin\\bash.exe'), false);

  const env = { ProgramW6432: 'C:\\Program Files', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
  const defaults = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];
  assert.deepEqual(gitBashCandidates(undefined, env), defaults);
  for (const git of ['D:\\Tools\\Git\\cmd\\git.exe', 'D:\\Tools\\Git\\bin\\git.exe', 'D:\\Tools\\Git\\mingw64\\bin\\git.exe']) {
    assert.deepEqual(gitBashCandidates(git, env), ['D:\\Tools\\Git\\bin\\bash.exe', ...defaults]);
  }
  assert.deepEqual(gitBashCandidates('C:\\Program Files\\Git\\cmd\\git.exe', env), defaults);
});

test('wraps bash script paths like Bash@3, quoting the path and leaving parameters to bash', () => {
  assert.equal(bashWrapperScript('/work/test.sh', ''), "exec bash '/work/test.sh'");
  assert.equal(bashWrapperScript("/work/it's here.sh", '"hello world" "$AS_SC_USERNAME"'), `exec bash '/work/it'\\''s here.sh' "hello world" "$AS_SC_USERNAME"`);
});

test('uses a shorthand as inline script content and infers its type', () => {
  assert.deepEqual(resolveScriptSource('inlineScript', undefined, undefined, undefined, { bash: 'echo hello' }), {
    type: 'bash', value: 'echo hello', isShorthand: true
  });
});

test('uses a shorthand as the script path in scriptPath mode', () => {
  assert.deepEqual(resolveScriptSource('scriptPath', 'powershell', undefined, undefined, { powershell: 'scripts/run.ps1' }), {
    type: 'powershell', value: 'scripts/run.ps1', isShorthand: true
  });
});

test('rejects conflicting shorthand inputs and script types', () => {
  assert.throws(() => resolveScriptSource('inlineScript', undefined, undefined, undefined, { pwsh: 'one', bash: 'two' }));
  assert.throws(() => resolveScriptSource('inlineScript', 'bash', undefined, undefined, { pwsh: 'one' }));
  assert.throws(() => resolveScriptSource('inlineScript', undefined, undefined, 'echo direct', { pwsh: 'one' }));
});
