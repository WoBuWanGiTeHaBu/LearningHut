/* 把 tools/xhs-cover.html 栅格化成小红书封面 PNG（3:4 = 1242x1656，另出 @2x 高清版）。 */
const path = require('node:path')
const fs = require('node:fs')

const OUT = path.join(__dirname, '..', 'marketing')
const W = 1242, H = 1656

async function main() {
  const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'))
  fs.mkdirSync(OUT, { recursive: true })

  const htmlUrl = 'file:///' + path.join(__dirname, 'xhs-cover.html').replace(/\\/g, '/')

  const browser = await chromium.launch({ channel: 'msedge', args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await page.goto(htmlUrl)
  await page.waitForTimeout(400)
  const f1 = path.join(OUT, 'xhs-cover-1242x1656.png')
  await page.screenshot({ path: f1 })

  await page.setViewportSize({ width: W, height: H })
  const page2 = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  await page2.goto(htmlUrl)
  await page2.waitForTimeout(400)
  const f2 = path.join(OUT, 'xhs-cover-2484x3312@2x.png')
  await page2.screenshot({ path: f2 })

  await browser.close()
  const report = [f1, f2].map(f => ({ file: path.basename(f), bytes: fs.statSync(f).size }))
  console.log('XHS_PNGS ' + JSON.stringify(report))
}

main().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1) })
