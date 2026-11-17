import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { junit } from 'node:test/reporters';

/** Identifies the test results of each platform and architecture, e.g. linux-arm64. */
export const RESULTS_NAME = `${process.platform}-${os.arch()}`;
export const RESULTS_FILE = path.resolve('build/test-results', `${RESULTS_NAME}.xml`);

/**
 * Node's junit reporter writes top-level tests as bare <testcase> elements, which JUnit
 * parsers ignore outside a <testsuite>. Groups them in one suite named after the platform.
 */
export function groupIntoSuite(xml: string, name: string): string {
  return xml
    .replace('<testsuites>', `<testsuites><testsuite name="${name}">`)
    .replace('</testsuites>', '</testsuite></testsuites>');
}

/**
 * A node:test reporter that writes grouped JUnit XML to build/test-results/<platform>-<arch>.xml.
 * It writes the file itself, so it emits nothing to its own destination.
 */
export default async function* groupedJunit(source: Parameters<typeof junit>[0]): AsyncGenerator<string> {
  let xml = '';
  for await (const chunk of junit(source)) xml += chunk;
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, groupIntoSuite(xml, RESULTS_NAME));
}
