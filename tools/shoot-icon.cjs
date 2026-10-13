/* 用无头浏览器把 tools/icon-src.html 的 SVG 栅格化成多个尺寸的 PNG。
   矢量渲染，每个尺寸都清晰；再交给 make-icon.py 打成 ICO。 */
const path = require('node:path')
const fs = require('node:fs')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const OUT = path.join(__dirname, '..', 'build', 'icon-src')

async function main() {
  const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'))
  fs.mkdirSync(OUT, { recursive: true })

  const htmlUrl = 'file:///' + path.join(__dirname, 'icon-src.html').replace(/\\/g, '/')

  // 用系统 Edge（和项目其它脚本一致）
  const browser = await chromium.launch({ channel: 'msedge', args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
  await page.goto(htmlUrl)
  await page.waitForTimeout(300)

  const report = []
  for (const s of SIZES) {
    await page.setViewportSize({ width: s, height: s })
    await page.waitForTimeout(120)
    const f = path.join(OUT, `icon-${s}.png`)
    await page.screenshot({ path: f, omitBackground: true })
    report.push({ size: s, bytes: fs.statSync(f).size })
  }

  // 额外导一张 512 的，供 README / 安装程序用
  await page.setViewportSize({ width: 512, height: 512 })
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(OUT, 'icon-512.png'), omitBackground: true })
  report.push({ size: 512, bytes: fs.statSync(path.join(OUT, 'icon-512.png')).size })

  await browser.close()
  console.log('ICON_PNGS ' + JSON.stringify(report))
}

main().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1) })
