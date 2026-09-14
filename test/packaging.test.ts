import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { nextReleaseVersion } from '../scripts/release-version.mts';

test('source patching runs before a build and the CI guard rejects patch zero', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-version-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'tasks/AuthenticatedScripts'), { recursive: true });
  const taskPath = path.join(directory, 'tasks/AuthenticatedScripts/task.json');
  const extensionPath = path.join(directory, 'vss-extension.json');
  fs.writeFileSync(taskPath, JSON.stringify({ name: 'Example', version: { Major: 2, Minor: 0, Patch: 0 } }));
  fs.writeFileSync(extensionPath, JSON.stringify({ id: 'example', version: '0.1.0' }));
  const releasesPath = path.join(directory, 'releases.json');
  fs.writeFileSync(releasesPath, JSON.stringify([[{ tag_name: 'v2.0.3', draft: false }]]));
  const mockGh = path.join(directory, 'mock-gh.cjs');
  fs.writeFileSync(mockGh, `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    require('node:child_process').execFileSync = (command, args) => {
      assert.equal(command, 'gh');
      assert.deepEqual(args, ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases?per_page=100']);
      if (process.env.MOCK_GH_FAILURE) throw new Error('GitHub CLI authentication failed');
      return fs.readFileSync('releases.json', 'utf8');
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const guard = path.resolve('scripts/check-task-version.mts');
  const patcher = path.resolve('scripts/patch-task-version.mts');
  const env = { ...process.env, CI: 'true', GITHUB_REF: 'refs/tags/unrelated-push-tag' };
  const before = spawnSync(process.execPath, [guard], { cwd: directory, env, encoding: 'utf8' });
  assert.equal(before.status, 1);
  assert.match(before.stderr, /task.json is unpatched/);
  execFileSync(process.execPath, [guard], { cwd: directory, env: { ...env, CI: 'false', GITHUB_ACTIONS: 'false' } });
  execFileSync(process.execPath, ['--require', mockGh, patcher], { cwd: directory, env });
  const patched = fs.readFileSync(taskPath, 'utf8');
  assert.deepEqual(JSON.parse(patched), { name: 'Example', version: { Major: 2, Minor: 0, Patch: 4 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(extensionPath, 'utf8')), { id: 'example', version: '2.0.4' });
  execFileSync(process.execPath, [guard], { cwd: directory, env });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), patched);
  const patchedExtension = fs.readFileSync(extensionPath, 'utf8');
  execFileSync(process.execPath, ['--require', mockGh, patcher], { cwd: directory, env });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), patched);
  assert.equal(fs.readFileSync(extensionPath, 'utf8'), patchedExtension);
  const failure = spawnSync(process.execPath, ['--require', mockGh, patcher], {
    cwd: directory, env: { ...env, MOCK_GH_FAILURE: 'true' }, encoding: 'utf8'
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /GitHub CLI authentication failed/);
  assert.equal(fs.readFileSync(taskPath, 'utf8'), patched);
  fs.writeFileSync(releasesPath, '[]');
  execFileSync(process.execPath, ['--require', mockGh, patcher], { cwd: directory, env: { ...env, GITHUB_REF: 'refs/heads/main' } });
  assert.equal(JSON.parse(fs.readFileSync(taskPath, 'utf8')).version.Patch, 1);
});

test('repacking is identical across independent archives and repeat runs', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-repeat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const zip = new AdmZip();
  zip.addFile('folder/', Buffer.alloc(0));
  zip.addFile('folder/example.txt', Buffer.from('example'));
  const results = ['first', 'second'].map(name => {
    const file = path.join(directory, `${name}.vsix`);
    zip.writeZip(file);
    execFileSync(process.execPath, [path.resolve('build/scripts/repack-vsix.js'), file, file]);
    const first = fs.readFileSync(file);
    execFileSync(process.execPath, [path.resolve('build/scripts/repack-vsix.js'), file, file]);
    assert.deepEqual(fs.readFileSync(file), first);
    return first;
  });
  assert.deepEqual(results[0], results[1]);
});

test('release patches come from the highest published release, excluding drafts, in the task version line', () => {
  assert.equal(nextReleaseVersion(2, 0, []), '2.0.1');
  assert.equal(nextReleaseVersion(2, 0, [{ tag_name: 'v2.0.8', draft: true }]), '2.0.1');
  assert.equal(nextReleaseVersion(2, 0, [
    { tag_name: 'v2.0.3', draft: false },
    { tag_name: 'v2.0.9', draft: true },
    { tag_name: 'v2.1.99', draft: false },
    { tag_name: 'v2.0.20-beta', draft: false },
    { tag_name: 'v2.0.1', draft: false }
  ]), '2.0.4');
});
