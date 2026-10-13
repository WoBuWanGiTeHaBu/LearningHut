/* 把 tools/xhs-pages.html 按 ?p= 逐页栅格化成小红书内页 PNG（1242x1656）。 */
const path = require('node:path')
const fs = require('node:fs')

const OUT = path.join(__dirname, '..', 'marketing')
const W = 1242, H = 1656
const PAGES = [
  { p: 2, name: 'xhs-02-goals.png' },
  { p: 3, name: 'xhs-03-routes.png' },
  { p: 4, name: 'xhs-04-library.png' },
  { p: 5, name: 'xhs-05-notes-checkin.png' },
  { p: 6, name: 'xhs-06-data.png' }
]

async function main() {
  const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'))
  fs.mkdirSync(OUT, { recursive: true })

  const htmlUrl = 'file:///' + path.join(__dirname, 'xhs-pages.html').replace(/\\/g, '/')
  const browser = await chromium.launch({ channel: 'msedge', args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

  const report = []
  for (const it of PAGES) {
    await page.goto(htmlUrl + '?p=' + it.p)
    await page.waitForTimeout(350)
    const f = path.join(OUT, it.name)
    await page.screenshot({ path: f })
    report.push({ page: it.p, file: it.name, bytes: fs.statSync(f).size })
  }

  await browser.close()
  console.log('XHS_PAGES ' + JSON.stringify(report))
}

main().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1) })
