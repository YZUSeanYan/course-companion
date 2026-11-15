const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const compilerDir = process.argv[2]
if (!compilerDir) throw new Error('Pass the installed WeChat wcc-exec directory as the first argument.')
const templates = []
const styles = ['app.wxss']
function visit(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) visit(relative)
    else if (relative.endsWith('.wxml')) templates.push(relative)
    else if (relative.endsWith('.wxss')) styles.push(relative)
  }
}
visit('pages')
visit('custom-tab-bar')
const artifacts = path.join(root, 'artifacts')
fs.mkdirSync(artifacts, { recursive: true })
for (const [name, files] of [['wcc', templates], ['wcsc', styles]]) {
  const output = path.join(artifacts, `${name}-${Date.now()}.js`)
  const binary = path.join(path.resolve(compilerDir), `${name}.exe`)
  const result = spawnSync(binary, ['-o', output, ...files], { cwd: root, encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
  console.log(`PASS ${name}: ${files.length} files, output ${path.relative(root, output)}`)
}
console.log('Template/style compilation only; not IDE packaging, simulator execution or device verification.')
