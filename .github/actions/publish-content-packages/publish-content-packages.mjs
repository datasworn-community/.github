import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  latestStableVersionOnLine,
  nextPatchVersion,
  schemaLineFor
} from './content-package-versions.mjs'

const root = process.cwd()
const mode = process.env.INPUT_MODE
const packageDir = path.resolve(root, process.env.INPUT_PACKAGE_DIR ?? 'dist/packages')
const prNumber = process.env.INPUT_PR_NUMBER
const headSha = process.env.INPUT_HEAD_SHA
const dryRun = process.env.INPUT_DRY_RUN === 'true'

if (!['release', 'canary'].includes(mode)) {
  throw new Error(`Unsupported publish-content-packages mode: ${mode}`)
}

if (mode === 'canary' && !prNumber) {
  throw new Error(`${mode} mode requires pr-number`)
}

if (mode === 'canary' && !headSha) {
  throw new Error('canary mode requires head-sha')
}

const generatedPackages = sortByInternalDependencies(getGeneratedPackages(packageDir))

if (generatedPackages.length === 0) {
  throw new Error(`No generated content packages found in ${packageDir}`)
}

const distTag = prNumber ? `pr-${prNumber}` : undefined
const summary = []
const installLines = []

if (mode === 'canary') {
  publishCanaries(generatedPackages)
  writeOutputs(summary, installLines)
  process.exit(0)
}

for (const contentPackage of generatedPackages) {
  const schemaLine = schemaLineFor(contentPackage.manifest.version)
  const latestVersion = latestPublishedVersionOnLine(
    contentPackage.manifest.name,
    schemaLine
  )
  const changed =
    latestVersion == null ||
    !artifactsEqual(contentPackage.dir, contentPackage.manifest.name, latestVersion)

  if (!changed) {
    const line = `- skipped ${contentPackage.manifest.name}@${latestVersion} (artifact unchanged)`
    console.log(line)
    summary.push(line)
    continue
  }

  const nextVersion = nextPatchVersion(schemaLine, latestVersion)
  rewriteManifest(contentPackage, { version: nextVersion })

  const line = `- published ${contentPackage.manifest.name}@${nextVersion}`
  console.log(line)
  summary.push(line)

  if (!dryRun) {
    run('npm', [
      'publish',
      contentPackage.dir,
      '--access',
      'public',
      '--provenance'
    ])
  }
}

writeOutputs(summary, installLines)

function publishCanaries(packages) {
  const shortSha = headSha.slice(0, 12)
  const canaryVersions = new Map()

  for (const contentPackage of packages) {
    const baseVersion = contentPackage.manifest.version.split('+')[0]
    canaryVersions.set(
      contentPackage.manifest.name,
      `${baseVersion}-experimental.${prNumber}.${shortSha}`
    )
  }

  for (const contentPackage of packages) {
    const canaryVersion = canaryVersions.get(contentPackage.manifest.name)
    rewriteManifest(contentPackage, {
      version: canaryVersion,
      dependencyVersions: canaryVersions
    })

    const line = `- canary ${contentPackage.manifest.name}@${canaryVersion}`
    console.log(line)
    summary.push(line)
    installLines.push(`npm i ${contentPackage.manifest.name}@${canaryVersion}`)
    installLines.push(`npm i ${contentPackage.manifest.name}@${distTag}`)

    if (!dryRun) {
      run('npm', [
        'publish',
        contentPackage.dir,
        '--access',
        'public',
        '--provenance',
        '--tag',
        distTag
      ])
    }
  }
}

function getGeneratedPackages(baseDir) {
  if (!fs.existsSync(baseDir)) return []

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(baseDir, entry.name)
      const manifestPath = path.join(dir, 'package.json')
      if (!fs.existsSync(manifestPath)) return undefined

      return {
        dir,
        manifestPath,
        manifest: readJson(manifestPath)
      }
    })
    .filter(Boolean)
    .filter((contentPackage) => !contentPackage.manifest.private)
}

function latestPublishedVersionOnLine(packageName, schemaLine) {
  const result = spawnSync('npm', ['view', packageName, 'versions', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  })

  if (result.status !== 0) return undefined

  const versions = JSON.parse(result.stdout || '[]')

  return latestStableVersionOnLine(
    Array.isArray(versions) ? versions : [versions],
    schemaLine
  )
}

function artifactsEqual(generatedDir, packageName, version) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datasworn-content-'))
  const packResult = spawnSync(
    'npm',
    ['pack', `${packageName}@${version}`, '--pack-destination', tmpDir, '--silent'],
    { cwd: root, encoding: 'utf8', env: process.env }
  )

  if (packResult.status !== 0) return false

  const tarball = packResult.stdout.trim().split('\n').at(-1)
  run('tar', ['-xzf', path.join(tmpDir, tarball), '-C', tmpDir])

  const publishedDir = path.join(tmpDir, 'package')
  return directorySnapshot(generatedDir) === directorySnapshot(publishedDir)
}

function directorySnapshot(dir) {
  const files = []
  walk(dir, files)

  return JSON.stringify(
    files
      .sort((left, right) => left.localeCompare(right, 'en-US'))
      .map((filePath) => {
        const relativePath = normalizePath(path.relative(dir, filePath))
        return [relativePath, normalizedFileContents(filePath, relativePath)]
      })
  )
}

function normalizedFileContents(filePath, relativePath) {
  if (relativePath === 'package.json') {
    const manifest = readJson(filePath)
    manifest.version = '<version>'
    return JSON.stringify(manifest)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath, files)
      continue
    }
    if (entry.isFile()) files.push(entryPath)
  }
}

function sortByInternalDependencies(packages) {
  const byName = new Map(packages.map((contentPackage) => [contentPackage.manifest.name, contentPackage]))
  const ordered = []
  const visiting = new Set()
  const visited = new Set()

  for (const contentPackage of packages) visit(contentPackage)
  return ordered

  function visit(contentPackage) {
    const packageName = contentPackage.manifest.name
    if (visited.has(packageName)) return
    if (visiting.has(packageName)) {
      throw new Error(`Cycle detected in content package dependencies at ${packageName}`)
    }

    visiting.add(packageName)
    for (const dependencyName of internalDependencyNames(contentPackage.manifest, byName)) {
      visit(byName.get(dependencyName))
    }
    visiting.delete(packageName)
    visited.add(packageName)
    ordered.push(contentPackage)
  }
}

function internalDependencyNames(manifest, byName) {
  const names = new Set()

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencyName of Object.keys(manifest[field] ?? {})) {
      if (byName.has(dependencyName)) names.add(dependencyName)
    }
  }

  return names
}

function rewriteManifest(contentPackage, options) {
  const manifest = structuredClone(contentPackage.manifest)
  manifest.version = options.version

  if (options.dependencyVersions) {
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'devDependencies'
    ]) {
      if (!manifest[field]) continue

      for (const dependencyName of Object.keys(manifest[field])) {
        if (options.dependencyVersions.has(dependencyName)) {
          manifest[field][dependencyName] = options.dependencyVersions.get(dependencyName)
        }
      }
    }
  }

  contentPackage.manifest = manifest
  writeJson(contentPackage.manifestPath, manifest)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeOutputs(summaryLines, installLines) {
  if (!process.env.GITHUB_OUTPUT) return

  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `summary<<EOF\n${summaryLines.join('\n')}\nEOF\n`
  )
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `install_lines<<EOF\n${installLines.join('\n')}\nEOF\n`
  )
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}
