import assert from 'node:assert/strict';
import test from 'node:test';
import { commandForScript, isSingleLine, resolveScriptSource, serviceConnectionEnvironment, variableNames } from '../tasks/AuthenticatedScripts/logic';

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
  assert.deepEqual(commandForScript('batch', 'test.cmd'), { command: 'test.cmd', args: [] });
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
