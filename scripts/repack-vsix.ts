import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync, type Zippable } from 'fflate';

// DOS timestamps are encoded from local calendar fields, so fixed fields give the same bytes in every timezone.
// Every entry is stamped 1980-01-01 00:00:00 (DOS date 0x0021, time 0x0000).
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

// "Version made by" host system 3 (Unix), so unzip tools apply the Unix mode in the high 16 bits of the
// external attributes. The low 16 bits hold MS-DOS attributes.
const UNIX = 3;
// Regular file (0o100000), mode 0644 (rw-r--r--), no DOS attributes: 0o100644 << 16.
const FILE_ATTRIBUTES = 0x81a4_0000;
// Directory (0o040000), mode 0755 (rwxr-xr-x), plus the MS-DOS directory bit (0x10): (0o040755 << 16) | 0x10.
const DIRECTORY_ATTRIBUTES = 0x41ed_0010;

// tfx writes the files it generates with os.EOL; normalize them to LF so Windows builds match Linux builds.
const TFX_GENERATED = new Set(['[Content_Types].xml', 'extension.vsixmanifest', 'extension.vsomanifest']);

export function normalizeLineEndings(name: string, contents: Uint8Array): Uint8Array {
  return TFX_GENERATED.has(name) ? Buffer.from(Buffer.from(contents).toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : contents;
}

/** The release artifact path, named after the (patched) extension version. */
export function releaseVsixPath(): string {
  const { version } = JSON.parse(fs.readFileSync('vss-extension.json', 'utf8'));
  return `dist/authenticated-scripts-v${version}.vsix`;
}

/**
 * Repacks a VSIX with sorted entries and fixed metadata.
 * fflate's deflate is pure JavaScript, so unlike Node's native zlib its output does not vary with the platform or CPU.
 */
export function repackVsix(inputPath: string, outputPath: string): void {
  const entries = Object.entries(unzipSync(fs.readFileSync(inputPath)));
  console.log(`Repacking ${entries.length} VSIX entries deterministically.`);

  // Bytewise sorting prevents the host locale from affecting artifact layout. fflate writes keys in insertion order.
  entries.sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));

  const files: Zippable = {};
  for (const [name, contents] of entries) {
    // Directories are stored (method 0, empty); files are deflated at level 9 (method 8).
    files[name] = name.endsWith('/')
      ? [new Uint8Array(0), { os: UNIX, attrs: DIRECTORY_ATTRIBUTES, level: 0 }]
      : [normalizeLineEndings(name, contents), { os: UNIX, attrs: FILE_ATTRIBUTES, level: 9 }];
  }
  const archive = zipSync(files, { mtime: ZIP_EPOCH });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, archive);
  fs.renameSync(temporaryPath, outputPath);
  console.log(`Wrote ${outputPath} (${archive.length} bytes).`);
}

if (require.main === module) {
  const [inputPath, outputPath = releaseVsixPath(), extra] = process.argv.slice(2);
  if (!inputPath || extra) throw new Error('Usage: repack-vsix <input.vsix> [output.vsix]');
  repackVsix(inputPath, outputPath);
}
