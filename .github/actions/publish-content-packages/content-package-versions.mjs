export function parseSemver(version) {
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version
    )
  if (!match) throw new Error(`Expected semver version, received ${version}`)

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? ''
  }
}

export function schemaLineFor(version) {
  const parsed = parseSemver(version)
  return `${parsed.major}.${parsed.minor}`
}

export function isStableVersion(version) {
  return parseSemver(version).prerelease === ''
}

export function latestStableVersionOnLine(versions, schemaLine) {
  return versions
    .filter((version) => typeof version === 'string')
    .filter((version) => schemaLineFor(version) === schemaLine)
    .filter(isStableVersion)
    .sort(compareSemver)
    .at(-1)
}

export function nextPatchVersion(schemaLine, latestVersion) {
  if (latestVersion == null) return `${schemaLine}.0`

  return `${schemaLine}.${parseSemver(latestVersion).patch + 1}`
}

export function compareSemver(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}
