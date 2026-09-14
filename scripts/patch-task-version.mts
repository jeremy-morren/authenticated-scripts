import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { nextReleaseVersion } from './release-version.mts';

if (process.argv[2]) 
  throw new Error('Usage: npm run patch:task (releases are fetched with gh).');

const taskPath = 'tasks/AuthenticatedScripts/task.json';
const extensionPath = 'vss-extension.json';
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
const extension = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

// gh resolves the repository from the checkout (or GH_REPO) and uses its local
// login or the GH_TOKEN supplied by CI. Fetch every page, not just recent releases.
const releases = JSON.parse(
  execFileSync('gh', 
    [ 'api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases?per_page=100' ],
    { 
      encoding: 'utf8', 
      stdio: ['ignore', 'pipe', 'inherit'], 
      maxBuffer: 64 * 1024 * 1024 
  })
).flat();

const version = nextReleaseVersion(task.version.Major, task.version.Minor, releases);
task.version.Patch = Number(version.split('.')[2]);
extension.version = version;
fs.writeFileSync(taskPath, JSON.stringify(task, null, 2) + '\n');
fs.writeFileSync(extensionPath, JSON.stringify(extension, null, 2) + '\n');
console.log(`Patched task and extension source versions to ${version}.`);
