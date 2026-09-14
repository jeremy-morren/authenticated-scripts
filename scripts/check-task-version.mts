import fs from 'node:fs';

interface TaskManifest {
  version: { Patch: number };
}

if (process.env.GITHUB_ACTIONS === 'true' || (process.env.CI && process.env.CI !== 'false')) {
  const task: TaskManifest = JSON.parse(fs.readFileSync('tasks/AuthenticatedScripts/task.json', 'utf8'));
  if (!Number.isSafeInteger(task.version.Patch) || task.version.Patch <= 0) {
    throw new Error('task.json is unpatched: run npm run patch:task before building in CI (Patch must be greater than 0).');
  }
}
