import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const mode = process.env.INPUT_MODE
const prNumber = process.env.INPUT_PR_NUMBER
const headSha = process.env.INPUT_HEAD_SHA

const dependencyFields = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies'
]

if (!['release', 'canary', 'cleanup'].includes(mode)) {
  throw new Error(`Unsupported publish-workspaces mode: ${mode}`)
}

if ((mode === 'canary' || mode === 'cleanup') && !prNumber) {
  throw new Error(`${mode} mode requires pr-number`)
}

if (mode === 'canary' && !headSha) {
  throw new Error('canary mode requires head-sha')
}

const rootManifestPath = path.join(root, 'package.json')
const rootManifest = readJson(rootManifestPath)
const workspacePatterns = getWorkspacePatterns(rootManifest)
const workspacePackages = getWorkspacePackages(workspacePatterns)
const publishablePackages = workspacePackages
  .filter((workspacePackage) => !workspacePackage.manifest.private)
  .filter((workspacePackage) => workspacePackage.manifest.name && workspacePackage.manifest.version)

if (publishablePackages.length === 0) {
  throw new Error('No publishable packages found. Declare packages in root workspaces and omit `private: true` for packages that should publish.')
}

const orderedPackages = sortByInternalDependencies(publishablePackages)
const distTag = prNumber ? `pr-${prNumber}` : undefined
const canaryVersions = new Map()
const installLines = []

if (mode === 'canary') {
  const shortSha = headSha.slice(0, 12)

  for (const workspacePackage of orderedPackages) {
    const baseVersion = workspacePackage.manifest.version.split('+')[0]
    canaryVersions.set(
      workspacePackage.manifest.name,
      `${baseVersion}-experimental.${prNumber}.${shortSha}`
    )
  }

  for (const workspacePackage of orderedPackages) {
    rewriteCanaryManifest(workspacePackage, canaryVersions)
  }
}

for (const workspacePackage of orderedPackages) {
  const packageName = workspacePackage.manifest.name

  if (mode === 'cleanup') {
    console.log(`Removing ${packageName}@${distTag}`)
    run('npm', ['dist-tag', 'rm', packageName, distTag], { allowFailure: true })
    continue
  }

  if (mode === 'canary') {
    const canaryVersion = canaryVersions.get(packageName)
    console.log(`Publishing ${packageName}@${canaryVersion} from ${workspacePackage.relativeDir}`)
    run('npm', ['publish', workspacePackage.dir, '--access', 'public', '--provenance', '--tag', distTag])
    installLines.push(`npm i ${packageName}@${canaryVersion}`)
    installLines.push(`npm i ${packageName}@${distTag}`)
    continue
  }

  console.log(`Publishing ${packageName} from ${workspacePackage.relativeDir}`)
  run('npm', ['publish', workspacePackage.dir, '--access', 'public', '--provenance'])
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `install_lines<<EOF\n${installLines.join('\n')}\nEOF\n`
  )
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function getWorkspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) {
    return manifest.workspaces
  }

  if (Array.isArray(manifest.workspaces?.packages)) {
    return manifest.workspaces.packages
  }

  return ['.']
}

function getWorkspacePackages(patterns) {
  const normalizedPatterns = patterns.map(normalizePattern)
  const matchers = normalizedPatterns.map(globToRegExp)
  const packageManifestPaths = []

  walk(root, packageManifestPaths)

  return packageManifestPaths
    .map((manifestPath) => {
      const dir = path.dirname(manifestPath)
      const relativeDir = normalizePath(path.relative(root, dir))

      return {
        dir,
        manifestPath,
        relativeDir,
        manifest: readJson(manifestPath)
      }
    })
    .filter((workspacePackage) => {
      if (workspacePackage.relativeDir === '' && normalizedPatterns.includes('')) {
        return true
      }

      return matchers.some((matcher) => matcher.test(workspacePackage.relativeDir))
    })
}

function walk(dir, packageManifestPaths) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue
    }

    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walk(entryPath, packageManifestPaths)
      continue
    }

    if (entry.isFile() && entry.name === 'package.json') {
      packageManifestPaths.push(entryPath)
    }
  }
}

function sortByInternalDependencies(packages) {
  const byName = new Map(packages.map((workspacePackage) => [workspacePackage.manifest.name, workspacePackage]))
  const ordered = []
  const visiting = new Set()
  const visited = new Set()

  for (const workspacePackage of packages) {
    visit(workspacePackage)
  }

  return ordered

  function visit(workspacePackage) {
    const packageName = workspacePackage.manifest.name

    if (visited.has(packageName)) {
      return
    }

    if (visiting.has(packageName)) {
      throw new Error(`Cycle detected in workspace package dependencies at ${packageName}`)
    }

    visiting.add(packageName)

    for (const dependencyName of getInternalDependencyNames(workspacePackage.manifest, byName)) {
      visit(byName.get(dependencyName))
    }

    visiting.delete(packageName)
    visited.add(packageName)
    ordered.push(workspacePackage)
  }
}

function getInternalDependencyNames(manifest, byName) {
  const names = new Set()

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencyName of Object.keys(manifest[field] ?? {})) {
      if (byName.has(dependencyName)) {
        names.add(dependencyName)
      }
    }
  }

  return names
}

function rewriteCanaryManifest(workspacePackage, versionsByName) {
  const manifest = structuredClone(workspacePackage.manifest)
  manifest.version = versionsByName.get(manifest.name)

  for (const field of dependencyFields) {
    if (!manifest[field]) {
      continue
    }

    for (const dependencyName of Object.keys(manifest[field])) {
      if (versionsByName.has(dependencyName)) {
        manifest[field][dependencyName] = versionsByName.get(dependencyName)
      }
    }
  }

  workspacePackage.manifest = manifest
  writeJson(workspacePackage.manifestPath, manifest)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function normalizePattern(value) {
  const normalized = normalizePath(value).replace(/\/+$/, '')

  if (normalized === '.') {
    return ''
  }

  return normalized
}

function globToRegExp(pattern) {
  let source = '^'

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const nextChar = pattern[index + 1]

    if (char === '*' && nextChar === '*') {
      source += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      source += '[^/]*'
      continue
    }

    source += escapeRegExp(char)
  }

  return new RegExp(`${source}$`)
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}
