import fs from 'node:fs';
import AdmZip from 'adm-zip';
import yazl from 'yazl';

interface VsixEntry {
  name: string;
  directory: boolean;
  contents: Buffer;
}

// Use fixed calendar fields and DOS-only timestamps for deterministic ZIP metadata.
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

/** Packs one existing VSIX with deterministic ZIP metadata and entry order. */
export async function repackVsix(vsixPath: string): Promise<void> {
  const entries: VsixEntry[] = new AdmZip(vsixPath)
    .getEntries()
    .map(entry => ({
      name: entry.entryName,
      directory: entry.isDirectory,
      contents: entry.isDirectory ? Buffer.alloc(0) : entry.getData()
    }));
  console.log(`Repacking ${entries.length} VSIX entries deterministically.`);
  // Bytewise sorting prevents the host locale from affecting artifact layout.
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));

  const temporaryPath = `${vsixPath}.tmp`;
  const output = fs.createWriteStream(temporaryPath);
  const zip = new yazl.ZipFile();
  const completed = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    zip.outputStream.on('error', reject);
  });
  zip.outputStream.pipe(output);
  for (const entry of entries) {
    if (entry.directory) {
      zip.addEmptyDirectory(entry.name, { mtime: ZIP_EPOCH, forceDosTimestamp: true, mode: 0o40755 });
    } else {
      // Stored entries avoid nondeterministic asynchronous compression scheduling.
      zip.addBuffer(entry.contents, entry.name, { mtime: ZIP_EPOCH, forceDosTimestamp: true, mode: 0o100644, compress: false });
    }
  }
  zip.end();
  await completed;
  fs.renameSync(temporaryPath, vsixPath);
  console.log(`Deterministic archive size: ${fs.statSync(vsixPath).size} bytes.`);
}

async function main(): Promise<void> {
  const vsixPath = process.argv[2];
  if (!vsixPath) throw new Error('Pass an explicit VSIX file path.');
  if (process.argv[3]) throw new Error('Patch source manifests with npm run patch:task before building.');
  await repackVsix(vsixPath);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
