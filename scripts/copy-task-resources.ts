import fs from 'node:fs';
import path from 'node:path';

fs.copyFileSync(
  require.resolve('azure-pipelines-task-lib/lib.json'),
  path.resolve('tasks/AuthenticatedScripts/dist/lib.json')
);
