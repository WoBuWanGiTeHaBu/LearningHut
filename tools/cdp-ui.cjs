// 真实 Electron 应用：用「点按钮 + 填表单 + 提交」的方式验证各页保存是否真的落库
const { chromium } = require('playwright-core')

const setVal = async (page, selector, value) => {
  return page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector)
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, { selector, value })
}

const clickByText = async (page, text) => {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')))
    if (!b) return false
    b.click()
    return true
  }, text)
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find(p => p.url().includes('index.html')) || ctx.pages()[0]
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error' && !String(m.text()).includes('404')) errs.push('console: ' + String(m.text()).slice(0, 200)) })
  await page.waitForTimeout(1000)

  const stamp = Date.now()
  const report = {}

  const go = async (hash) => { await page.evaluate(h => { location.hash = h }, hash); await page.waitForTimeout(1000) }
  const countList = async (which) => page.evaluate(async (w) => {
    // records.list 需要日期范围，其余 list 无参
    const r = w === 'records'
      ? await window.api.records.list({ from: '2000-01-01', to: '2099-12-31' })
      : await window.api[w].list()
    if (Array.isArray(r)) return r.length
    if (Array.isArray(r?.rows)) return r.rows.length
    return -1
  }, which)

  // 直接回库里找标题，比只看 DOM 更可靠
  const existsIn = async (which, title) => page.evaluate(async ({ w, t }) => {
    const r = w === 'records'
      ? await window.api.records.list({ from: '2000-01-01', to: '2099-12-31' })
      : await window.api[w].list()
    const arr = Array.isArray(r) ? r : (r?.rows || [])
    return arr.some(x => String(x.title || x.content || '').includes(t))
  }, { w: which, t: title })

  // ---------- 1. 学习记录：点「写记录」→ 填 → 点「记下」 ----------
  await go('#/records')
  const recBefore = await countList('records')
  await clickByText(page, '写记录')
  await page.waitForTimeout(500)
  const recText = 'UI验证记录' + stamp
  await setVal(page, '.modal textarea', recText)
  await clickByText(page, '记下')
  await page.waitForTimeout(1200)
  const recAfter = await countList('records')
  const recFound = await existsIn('records', recText)
  report.record = { before: recBefore, after: recAfter, delta: recAfter - recBefore, visibleInList: recFound }

  // ---------- 2. 资料库：收一份资料 → 收好 ----------
  await go('#/library')
  const matBefore = await countList('materials')
  await clickByText(page, '收一份资料')
  await page.waitForTimeout(500)
  const matText = 'UI验证资料' + stamp
  await setVal(page, '.modal input.input', matText)
  await clickByText(page, '收好')
  await page.waitForTimeout(1200)
  const matAfter = await countList('materials')
  report.material = { before: matBefore, after: matAfter, delta: matAfter - matBefore, visible: await existsIn('materials', matText) }

  // ---------- 3. 项目：立一个项目 → 存进瓶子 ----------
  await go('#/projects')
  const prjBefore = await countList('projects')
  await clickByText(page, '立一个项目')
  await page.waitForTimeout(500)
  const prjText = 'UI验证项目' + stamp
  await setVal(page, '.modal input.input', prjText)
  await clickByText(page, '存进瓶子')
  await page.waitForTimeout(1200)
  const prjAfter = await countList('projects')
  report.project = { before: prjBefore, after: prjAfter, delta: prjAfter - prjBefore, visible: await existsIn('projects', prjText) }

  // ---------- 4. 想学清单：冒一棵新芽 → 种下 ----------
  await go('#/wishlist')
  const wlBefore = await countList('wishlist')
  await clickByText(page, '冒一棵新芽')
  await page.waitForTimeout(500)
  const wlText = 'UI验证想学' + stamp
  await setVal(page, '.modal input.input', wlText)
  await clickByText(page, '种下')
  await page.waitForTimeout(1200)
  const wlAfter = await countList('wishlist')
  report.wishlist = { before: wlBefore, after: wlAfter, delta: wlAfter - wlBefore, visible: await existsIn('wishlist', wlText) }

  // ---------- 5. 目标量化：先造一个带量化总量的目标 → 记一笔进度 → 记下 ----------
  const goalTitle = 'UI量化目标' + stamp
  await page.evaluate(async (t) => {
    await window.api.goals.create({ title: t, target_total: 30, target_unit: 'p' })
  }, goalTitle)
  await go('#/goals')
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  // 点到这个目标
  const picked = await page.evaluate((t) => {
    const n = [...document.querySelectorAll('.gnode')].find(x => x.innerText.includes(t))
    if (!n) return false
    const m = n.querySelector('.gmain'); (m || n).click(); return true
  }, goalTitle)
  await page.waitForTimeout(900)
  const qtyOf = () => page.evaluate(() => document.querySelector('.pp-num b')?.textContent?.trim() || null)
  const qtBefore = await qtyOf()
  const opened = await clickByText(page, '记一笔进度')
  await page.waitForTimeout(700)
  if (opened) {
    await page.evaluate(() => {
      const ins = [...document.querySelectorAll('.modal input')]
      const n = ins.find(i => i.type === 'number') || ins[ins.length - 1]
      if (!n) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(n, '5')
      n.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    const preview = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.modal *')].find(e => e.children.length === 0 && e.textContent && e.textContent.includes('记下后'))
      return el ? el.parentElement.textContent.replace(/\s+/g, ' ').trim() : null
    })
    await clickByText(page, '记下')
    await page.waitForTimeout(1500)
    const qtAfter = await qtyOf()
    report.progress = { picked, modalOpened: opened, previewText: preview, before: qtBefore, after: qtAfter, changed: qtBefore !== qtAfter }
  } else {
    report.progress = { picked, modalOpened: false, before: qtBefore }
  }

  // ---------- 6. 记录弹窗几何（左上角缺角问题） ----------
  await go('#/records')
  await clickByText(page, '写记录')
  await page.waitForTimeout(700)
  const modalGeo = await page.evaluate(() => {
    const ov = document.querySelector('.overlay')
    const mo = document.querySelector('.modal')
    if (!ov || !mo) return { found: false }
    const r = mo.getBoundingClientRect(), o = ov.getBoundingClientRect()
    const cs = getComputedStyle(mo)
    return {
      found: true, vw: innerWidth, vh: innerHeight,
      overlayCovers: Math.round(o.width) >= innerWidth && Math.round(o.height) >= innerHeight,
      modal: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      centered: Math.abs((r.x + r.width / 2) - innerWidth / 2) < 3 && Math.abs((r.y + r.height / 2) - innerHeight / 2) < 3,
      radius: cs.borderTopLeftRadius, overflow: cs.overflow
    }
  })
  report.modal = modalGeo
  await page.screenshot({ path: 'shots/real-record-modal.png' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  console.log('UI_REPORT=' + JSON.stringify(report, null, 1))
  console.log('PAGE_ERRORS=' + JSON.stringify(errs.slice(0, 8)))
  process.exit(0)
})().catch(e => { console.log('FAIL', e.message, e.stack?.slice(0, 500)); process.exit(1) })
