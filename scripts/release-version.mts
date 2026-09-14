interface Release {
  tag_name: string;
  draft: boolean;
}

/** Allocate from published GitHub release tags in this task's major/minor line. */
export function nextReleaseVersion(major: number, minor: number, releases: Release[]): string {
  if (![major, minor].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Task major/minor must be non-negative integers.');
  }
  let patch = 0;
  for (const release of releases) {
    if (release.draft) continue;
    const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(release.tag_name);
    if (match && Number(match[1]) === major && Number(match[2]) === minor) {
      const releasedPatch = Number(match[3]);
      if (!Number.isSafeInteger(releasedPatch)) 
        throw new Error('Release patch is too large.');
      patch = Math.max(patch, releasedPatch);
    }
  }
  if (!Number.isSafeInteger(patch + 1))
    throw new Error('Release patch is too large.');
  return `${major}.${minor}.${patch + 1}`;
}
