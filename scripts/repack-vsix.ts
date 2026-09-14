import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import yazl from 'yazl';

interface VsixEntry {
  name: string;
  directory: boolean;
  contents: Buffer;
}

// Use fixed calendar fields and DOS-only timestamps for deterministic ZIP metadata.
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

/** The release artifact path, named after the (patched) extension version. */
export function releaseVsixPath(): string {
  const { version } = JSON.parse(fs.readFileSync('vss-extension.json', 'utf8'));
  return `dist/authenticated-scripts-v${version}.vsix`;
}

/** Packs one existing VSIX with deterministic ZIP metadata and entry order. */
export async function repackVsix(inputPath: string, outputPath: string): Promise<void> {
  const entries: VsixEntry[] = new AdmZip(inputPath)
    .getEntries()
    .map(entry => ({
      name: entry.entryName,
      directory: entry.isDirectory,
      contents: entry.isDirectory ? Buffer.alloc(0) : entry.getData()
    }));
  console.log(`Repacking ${entries.length} VSIX entries deterministically.`);
  // Bytewise sorting prevents the host locale from affecting artifact layout.
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
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
  fs.renameSync(temporaryPath, outputPath);
  console.log(`Wrote ${outputPath} (${fs.statSync(outputPath).size} bytes).`);
}

async function main(): Promise<void> {
  const [inputPath, outputPath = releaseVsixPath(), extra] = process.argv.slice(2);
  if (!inputPath || extra) throw new Error('Usage: repack-vsix <input.vsix> [output.vsix]');
  await repackVsix(inputPath, outputPath);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
