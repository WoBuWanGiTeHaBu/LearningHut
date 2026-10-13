// 诊断概览页：「没铺满 / 滚轮不动」到底是哪一层的高度出了问题
const { chromium } = require('playwright-core')
const out = { PAGE_ERRORS: [], CONSOLE_ERRORS: [], CONSOLE_WARN: [], SIZES: [] }

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('pageerror', e => out.PAGE_ERRORS.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') out.CONSOLE_ERRORS.push(m.text()); else if (m.type() === 'warning') out.CONSOLE_WARN.push(m.text()) })
  await page.waitForFunction(() => !!(window.api && document.querySelector('.shell')), null, { timeout: 30000 })

  const nav = async (label) => {
    await page.evaluate((lb) => {
      const el = [...document.querySelectorAll('.nav-item')].find(x => x.textContent.trim() === lb)
      el && el.click()
    }, label)
    await page.waitForTimeout(1100)
  }

  const probe = () => {
    const r = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }
    }
    const pageEl = document.querySelector('.page.dash')
    const grid = document.querySelector('.dash .grid')
    const cs = (el) => el ? getComputedStyle(el) : null
    return {
      win: { w: window.innerWidth, h: window.innerHeight },
      shell: r('.shell'),
      content: r('.content'),
      contentOverflow: cs(document.querySelector('.content'))?.overflow,
      pageEl: r('.page.dash'),
      pageClientH: pageEl?.clientHeight,
      pageScrollH: pageEl?.scrollHeight,
      pageOverflowY: cs(pageEl)?.overflowY,
      pageHeight: cs(pageEl)?.height,
      pageMinHeight: cs(pageEl)?.minHeight,
      pageDisplay: cs(pageEl)?.display,
      grid: r('.dash .grid'),
      gridRows: cs(grid)?.gridTemplateRows,
      gridH: cs(grid)?.height,
      gridFlex: cs(grid)?.flex,
      head: r('.page.dash .page-head'),
      heat: r('.dash .heat-card'),
      goalsCard: r('.dash .goals-card'),
      wallCard: r('.dash .wall-card'),
      wallWrap: r('.dash .wall-card .wall-wrap'),
      wall: r('.dash .wall'),
      // 页面底部到视口底部的空白
      blankBelowGrid: grid ? Math.round(window.innerHeight - grid.getBoundingClientRect().bottom) : null
    }
  }

  // 不往库里写任何测试数据：概览的空态同样能验证填充/滚动，且不污染开发库

  for (const vp of [{ w: 1280, h: 700 }, { w: 1400, h: 1050 }, { w: 1280, h: 900 }, { w: 1000, h: 640 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    await nav('概览')
    await page.waitForTimeout(700)
    const s = await page.evaluate(probe)
    // 真实的鼠标滚轮测试（不靠改 scrollTop）
    await page.mouse.move(s.win ? 700 : 700, Math.round(vp.h / 2))
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(400)
    const afterWheel = await page.evaluate(() => document.querySelector('.page.dash')?.scrollTop || 0)
    s.wheelScrolledTo = afterWheel
    s.maxScroll = s.pageScrollH - s.pageClientH
    out.SIZES.push(s)
  }

  await page.setViewportSize({ width: 1280, height: 780 })
  // 先离开概览再回来，强制 Dashboard/HeatMap 重新挂载，让挂载期的报错能被我们的监听抓到
  out.MOUNT_CONSOLE_BASE = out.CONSOLE_ERRORS.length
  await nav('学习记录')
  await page.waitForTimeout(600)
  await nav('概览')
  await page.waitForTimeout(1400)
  out.MOUNT_CONSOLE_ERRORS = out.CONSOLE_ERRORS.slice(out.MOUNT_CONSOLE_BASE)
  out.HEATMAP = await page.evaluate(async () => {
    const card = document.querySelector('.dash .heat-card')
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width) } }
    let apiCount = null
    try { apiCount = (await window.api.heatmap('study')).length } catch (e) { apiCount = 'ERR ' + e }
    return {
      cardHTML: card ? card.innerHTML.replace(/\s+/g, ' ').slice(0, 400) : null,
      hmClasses: [...document.querySelectorAll('.dash [class]')].map(e => e.className).slice(0, 20),
      anyHm: document.querySelectorAll('[class*="hm"]').length,
      monthLabels: document.querySelectorAll('.dash .mlabel').length,
      weeks: document.querySelectorAll('.dash .week-col').length,
      cells: document.querySelectorAll('.dash .cell').length,
      heatCard: r('.dash .heat-card'),
      apiCount
    }
  })
  await page.screenshot({ path: 'tools/shot-dash-layout.png' })

  // ---------- 横向不溢出 / 滚轮在各种悬停位置都能上下滚 ----------
  await page.setViewportSize({ width: 1000, height: 640 })
  await nav('学习记录'); await page.waitForTimeout(500)
  await nav('概览'); await page.waitForTimeout(1000)

  out.HSCROLL = await page.evaluate(() => {
    const p = document.querySelector('.page.dash')
    return { scrollW: p.scrollWidth, clientW: p.clientWidth, overflowX: p.scrollWidth > p.clientWidth }
  })

  out.WHEEL_OVER = []
  const zones = [
    ['空白区', 700, 120],
    ['目标卡片', 350, 300],
    ['便签墙', 700, 560],
    ['热力图', 700, 200]
  ]
  for (const [name, x, y] of zones) {
    await page.evaluate(() => { const d = document.querySelector('.page.dash'); if (d) d.scrollTop = 0 })
    await page.waitForTimeout(250)
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(350)
    const top = await page.evaluate(() => document.querySelector('.page.dash').scrollTop)
    out.WHEEL_OVER.push({ zone: name, scrolledTo: Math.round(top) })
  }

  // ---------- 全部页面重新挂载，抓挂载期报错（漏 import 这类构建不报错） ----------
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-item')].map(x => x.textContent.replace(/\s+/g, ' ').trim())
  )
  out.PAGES = []
  const errBase = out.CONSOLE_ERRORS.length
  for (const lb of [...labels, ...[...labels].reverse()]) {
    const before = out.CONSOLE_ERRORS.length
    await nav(lb)
    const info = await page.evaluate(() => {
      const p = document.querySelector('.page')
      if (!p) return { rendered: false }
      const txt = p.innerText.replace(/\s+/g, ' ').trim()
      return { rendered: true, h: Math.round(p.getBoundingClientRect().height), textLen: txt.length, blank: txt.length < 10 }
    })
    out.PAGES.push({ page: lb, ...info, newErrors: out.CONSOLE_ERRORS.slice(before) })
  }
  out.PAGE_REMOUNT_ERRORS = out.CONSOLE_ERRORS.slice(errBase)

  // ---------- 随手记 / 项目档案 也要按「学习/爱好」分开 ----------
  await page.setViewportSize({ width: 1280, height: 780 })
  await nav('概览')
  await page.waitForTimeout(700)
  out.SHARED = await page.evaluate(async () => {
    const api = window.api
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const go = async (label) => {
      const el = [...document.querySelectorAll('.nav-item')].find(x => x.textContent.trim() === label)
      if (el) el.click()
      await sleep(1100)
    }
    const pickDomain = async (d) => {
      const b = [...document.querySelectorAll('.sidebar .ds')].find(x => x.textContent.includes(d === 'study' ? '学习' : '爱好'))
      if (b) b.click()
      await sleep(900)
    }
    const wallIds = () => [...document.querySelectorAll('.dash .wall [data-note]')].map(e => Number(e.getAttribute('data-note')))
    const projTitles = () => [...document.querySelectorAll('.proj-page .p-title b')].map(e => e.textContent.trim())

    // 两个域各建一张便签 + 一个项目
    const nStudy = await api.notes.create({ content: 'VD学习便签', color: '#E4EC81', x: 20, y: 20, domain: 'study' })
    const nHobby = await api.notes.create({ content: 'VD爱好便签', color: '#DDE6EA', x: 40, y: 60, domain: 'hobby' })
    const pStudy = await api.projects.create({ title: 'VD学习项目', domain: 'study' })
    const pHobby = await api.projects.create({ title: 'VD爱好项目', domain: 'hobby' })

    await pickDomain('study')
    await go('学习记录'); await go('概览')
    const wallStudy = wallIds()
    const notesStudy = (await api.notes.list('study')).map(n => n.id)
    const notesHobby = (await api.notes.list('hobby')).map(n => n.id)
    const projStudy = (await api.projects.list('study')).map(p => p.id)
    const projHobby = (await api.projects.list('hobby')).map(p => p.id)
    await go('项目档案')
    const projTitlesStudy = projTitles()

    await pickDomain('hobby')
    await go('学习记录'); await go('概览')
    const wallHobby = wallIds()
    const notesStudy2 = (await api.notes.list('study')).map(n => n.id)
    const notesHobby2 = (await api.notes.list('hobby')).map(n => n.id)
    await go('项目档案')
    const projTitlesHobby = projTitles()

    // 切回「学习」并清理，不污染开发库
    await pickDomain('study')
    for (const id of [nStudy.id, nHobby.id]) await api.notes.remove(id)
    for (const id of [pStudy.id, pHobby.id]) await api.projects.remove(id)
    await go('概览')

    return {
      notesStudyOnly: notesStudy.includes(nStudy.id) && !notesStudy.includes(nHobby.id),
      notesHobbyOnly: notesHobby.includes(nHobby.id) && !notesHobby.includes(nStudy.id),
      projectsStudyOnly: projStudy.includes(pStudy.id) && !projStudy.includes(pHobby.id),
      projectsHobbyOnly: projHobby.includes(pHobby.id) && !projHobby.includes(pStudy.id),
      wallStudyOnlyStudyNote: wallStudy.includes(nStudy.id) && !wallStudy.includes(nHobby.id),
      wallHobbyOnlyHobbyNote: wallHobby.includes(nHobby.id) && !wallHobby.includes(nStudy.id),
      projPageStudy: projTitlesStudy,
      projPageHobby: projTitlesHobby,
      projPageSeparated: projTitlesStudy.includes('VD学习项目') && !projTitlesStudy.includes('VD爱好项目')
        && projTitlesHobby.includes('VD爱好项目') && !projTitlesHobby.includes('VD学习项目'),
      notesListStable: JSON.stringify(notesStudy) === JSON.stringify(notesStudy2) && JSON.stringify(notesHobby) === JSON.stringify(notesHobby2)
    }
  })

  await nav('概览')
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'tools/shot-dash-final.png' })

  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch(e => { console.log(JSON.stringify({ FATAL: String(e), ...out }, null, 2)); process.exit(1) })
