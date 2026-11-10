const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
let files = 0
let bytes = 0
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['tests', 'tools', 'artifacts', 'node_modules'].includes(entry.name) || entry.name.startsWith('.')) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) { visit(file); continue }
    if (!/\.(?:js|json|wxml|wxss)$/.test(file) || entry.name === 'project.private.config.json') continue
    const source = fs.readFileSync(file, 'utf8')
    files += 1
    bytes += Buffer.byteLength(source)
    if (file.endsWith('.json')) JSON.parse(source)
    if (file.endsWith('.js')) {
      new vm.Script(source, { filename: file })
      assert(!/\bwx\.(?:request|uploadFile|downloadFile|connectSocket|login|getRecorderManager|cloud)\b/.test(source), `Offline build must not call cloud/audio APIs: ${file}`)
      for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        assert(fs.existsSync(path.resolve(path.dirname(file), `${match[1]}.js`)), `Missing local module ${match[1]} in ${file}`)
      }
    }
    if (file.endsWith('.wxml')) {
      assert(!/<(?:script|iframe|web-view|rich-text|br)\b/.test(source), `Unexpected markup in ${file}`)
      const controller = fs.readFileSync(file.replace(/\.wxml$/, '.js'), 'utf8')
      for (const match of source.matchAll(/(?:bind|catch):?(?:tap|submit|change|input|blur)="([A-Za-z_$][\w$]*)"/g)) {
        assert(new RegExp(`\\b${match[1]}\\s*\\(`).test(controller), `Missing handler ${match[1]}: ${file}`)
      }
    }
  }
}
for (const page of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(root, `${page}.${ext}`)), `Missing page ${page}.${ext}`)
}
assert.equal(project.setting.urlCheck, true)
assert.equal(app.tabBar.custom, true)
assert.equal(app.tabBar.list.length, 3)
visit(root)
assert(bytes < 2 * 1024 * 1024, 'Source bundle exceeds conservative 2MB budget')
console.log(`PASS static checks: ${files} source/config files; ${(bytes / 1024).toFixed(1)} KiB. Not a WeChat compiler or device test.`)
