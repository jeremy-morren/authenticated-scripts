import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { releaseVsixPath } from './repack-vsix';

/** Tests that the release artifact can be reproduced byte-for-byte from the source and toolchain. */
function packageAndHash(): string {
  // Build from source each time; do not reuse a previous VSIX or checksum.
  childProcess.execSync('npm run package', { stdio: 'inherit' });
  return crypto.createHash('sha256')
    .update(fs.readFileSync(releaseVsixPath()))
    .digest('hex');
}

const first = packageAndHash();
const second = packageAndHash();
if (first !== second) {
  throw new Error(`Non-reproducible VSIX: ${first} != ${second}`);
}
console.log(`Reproducible VSIX SHA-256: ${first}`);
