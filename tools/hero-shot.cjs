/* 渲染 README 主视觉（1600x900）到 docs/images/hero.png，并复制 logo。 */
const path = require('node:path')
const fs = require('node:fs')

const OUT = path.join(__dirname, '..', 'docs', 'images')

async function main() {
  const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'))
  fs.mkdirSync(OUT, { recursive: true })

  const htmlUrl = 'file:///' + path.join(__dirname, 'readme-hero.html').replace(/\\/g, '/')
  const browser = await chromium.launch({ channel: 'msedge', args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(htmlUrl)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'hero.png') })
  await browser.close()

  fs.copyFileSync(path.join(__dirname, '..', 'build', 'icon-src', 'icon-512.png'), path.join(OUT, 'logo.png'))
  const report = fs.readdirSync(OUT).map(f => ({ file: f, bytes: fs.statSync(path.join(OUT, f)).size }))
  console.log('HERO ' + JSON.stringify(report))
}

main().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1) })
