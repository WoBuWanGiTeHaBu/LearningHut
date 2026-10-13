/* 本轮四项改动的真机验证（走点击路径，读完库核对）：
   R1 学习路线：折叠某个有子节点的节点 → 再新增节点 → 折叠状态必须还在
   R2 便签：随手记页拖动一张 → 只有 x2/y2 变、x/y 不变；概览页位置不受影响
   R3 资料：目标页「关联已有 / 新建资料」→ 资料库列表出现「目标 · xxx」标签
   R4 目标：设置起始/目标时间 → 出现时间与节奏面板 + 量化提醒；树上出现过期标记
   用法：bash tools/run-ui-verify.sh tools/cdp-req.cjs
   结果写 tools/req-report.txt，图在 shots-req/ */
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots-req')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const lines = []
const P = (...a) => { const s = a.join(' '); lines.push(s); console.log(s) }
const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'))
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await page.waitForLoadState('domcontentloaded')
  await wait(2000)

  const go = async (h) => { await page.evaluate((x) => { location.hash = x }, h); await wait(900) }
  // 离开再回来 → 强制重挂载，抓「挂载期」的运行时错误（CDP 连上时早就挂载完了）
  const remount = async (h) => { await go('#/settings'); await go(h) }
  const domain = await page.evaluate(() => localStorage.getItem('sh-domain') || 'study')
  P('DOMAIN ' + domain)

  /* ================= R1 学习路线折叠状态 ================= */
  let madeRoot = false, madeHost = false, madeKid = false
  try {
    await remount('#/routes')
    const newDialog = async (text) => {
      await page.locator('.overlay .modal input.input').fill(text)
      await page.locator('.overlay .modal-foot .btn.primary').click()
      await wait(900)
    }
    const rowsInfo = () => page.evaluate(() => Array.from(document.querySelectorAll('.col-tree .rnode')).map((r) => ({
      title: r.querySelector('.rtitle')?.value || '',
      hasKids: !!r.querySelector('button.tw'),
      open: (r.querySelector('button.tw')?.textContent || '').trim() === '▾'
    })))
    const rowIdx = async (title) => (await rowsInfo()).findIndex((r) => r.title === title)
    const addChildTo = async (title, childName) => {
      const i = await rowIdx(title)
      if (i < 0) throw new Error('找不到节点 ' + title)
      await page.locator('.col-tree .rnode').nth(i).locator('.rops button[title="加子节点"]').click()
      await wait(400)
      await newDialog(childName)
    }

    // 保证有：一条路线 → 一个节点 A → A 下面还有一个子节点（折叠才有的测）
    if (!(await page.locator('.domain-tabs .dtab:not(.add)').count())) {
      await page.locator('.page-head .btn.primary').first().click()
      await wait(400); await newDialog('验证路线'); madeRoot = true
    }
    if (!(await page.locator('.col-tree .rnode').count())) {
      await page.locator('.col-head .ch-ops button[title="加一个顶层节点"]').first().click()
      await wait(400); await newDialog('验证节点A'); madeHost = true
    }
    const firstRow = (await rowsInfo())[0]
    const hostName = firstRow.title
    if (!firstRow.hasKids) { await addChildTo(hostName, '验证子节点A2'); madeKid = true }

    const before = await rowsInfo()
    P('R1 初始 ' + JSON.stringify(before.map((r) => r.title + (r.hasKids ? (r.open ? '▾' : '▸') : '·'))))

    // 折叠 A，再新增一个节点 —— 老版本这一下会把折叠的全摊开
    const hi = await rowIdx(hostName)
    await page.locator('.col-tree .rnode').nth(hi).locator('button.tw').click()
    await wait(500)
    const collapsedMark = (await rowsInfo())[hi]?.open ? '▾' : '▸'
    P('R1 折叠 ' + hostName + ' → ' + collapsedMark + ' 行数=' + (await page.locator('.col-tree .rnode').count()))
    await page.screenshot({ path: path.join(OUT, 'routes-collapsed.png') })

    await page.locator('.col-head .ch-ops button[title="加一个顶层节点"]').first().click()
    await wait(400); await newDialog('验证节点B')
    const afterRows = await rowsInfo()
    const afterMark = afterRows[hi]?.open ? '▾' : '▸'
    P('R1 新增节点B 后 ' + hostName + ' 标记=' + afterMark + ' 行数=' + afterRows.length)
    P('R1 PASS=' + (collapsedMark === '▸' && afterMark === '▸'))
    await page.screenshot({ path: path.join(OUT, 'routes-after-add.png') })

    // 清理：B 一定删；A2 / A 只在本次自己建的才删；最后把 A 展开回去
    const delRow = async (name) => {
      const i = await rowIdx(name)
      if (i < 0) return
      await page.locator('.col-tree .rnode').nth(i).locator('.rops button.del').click()
      await wait(500)
      await page.locator('.cf-ok').click()
      await wait(800)
    }
    await delRow('验证节点B')
    if (madeKid) {
      // A 现在是折叠的，先展开才能点到 A2
      const i = await rowIdx(hostName)
      if (i >= 0 && !(await rowsInfo())[i].open) { await page.locator('.col-tree .rnode').nth(i).locator('button.tw').click(); await wait(500) }
      await delRow('验证子节点A2')
    }
    if (madeHost) await delRow(hostName)
    else {
      // 还原成展开状态（别把用户原来的折叠习惯改了）
      const i = await rowIdx(hostName)
      if (i >= 0 && !(await rowsInfo())[i].open) { await page.locator('.col-tree .rnode').nth(i).locator('button.tw').click(); await wait(500) }
    }
    if (madeRoot) {
      const btn = page.locator('.col-head .ch-ops button[title="删除整条路线"]')
      if (await btn.count()) { await btn.click(); await wait(500); await page.locator('.cf-ok').click(); await wait(800) }
    }
    P('R1 清理完成 行数=' + (await page.locator('.col-tree .rnode').count()))
  } catch (e) { P('R1 FAIL ' + (e && e.message)) }

  /* ================= R2 便签两块板坐标独立 ================= */
  try {
    await remount('#/notes')
    await page.locator('.wall-tools .btn.primary').click()
    await wait(800)
    const nid = await page.evaluate(() => Number(document.querySelector('.wall .note')?.getAttribute('data-note')))
    P('R2 新建便签 id=' + nid)
    const rec = async () => page.evaluate(async (d) => {
      const list = await window.api.notes.list(d)
      return list.map((n) => ({ id: n.id, x: n.x, y: n.y, x2: n.x2, y2: n.y2 }))
    }, domain)
    const before = (await rec()).find((n) => n.id === nid)
    P('R2 before ' + JSON.stringify(before))

    const box = await page.locator(`.wall .note[data-note="${nid}"]`).boundingBox()
    const sx = box.x + box.width / 2
    const sy = box.y + 10
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + 70, sy + 50, { steps: 10 })
    await page.mouse.up()
    await wait(800)
    const after = (await rec()).find((n) => n.id === nid)
    P('R2 after  ' + JSON.stringify(after))
    P('R2 x2 变了=' + (Math.abs((after.x2 ?? 0) - (before.x2 ?? 0)) > 30) + ' x 没动=' + (after.x === before.x))
    await page.screenshot({ path: path.join(OUT, 'notes-dragged.png') })

    await remount('#/')
    const dashPos = await page.evaluate((id) => {
      const el = document.querySelector(`.wall .note[data-note="${id}"]`)
      return el ? { left: Math.round(parseFloat(el.style.left)), top: Math.round(parseFloat(el.style.top)) } : null
    }, nid)
    // 概览板比随手记板矮，clampAll 会把 top 视觉上收紧（这是既有的显示行为，不落库）；
    // 关键是：库里 x 没动、概览渲染的 left 还是 x、而不是随手记拖出来的 x2
    P('R2 概览页位置=' + JSON.stringify(dashPos) + ' 期望 left=x=' + before.x + '，随手记 x2=' + Math.round(after.x2))
    P('R2 PASS=' + (
      after.x === before.x &&
      Math.abs(after.x2 - before.x2) > 30 &&
      !!dashPos && Math.abs(dashPos.left - before.x) < 3 && Math.abs(dashPos.left - after.x2) > 20
    ))
    await page.screenshot({ path: path.join(OUT, 'dash-unaffected.png') })

    // 撕掉这张空便签
    await go('#/notes')
    const del = page.locator(`.wall .note[data-note="${nid}"] .n-tools button`).nth(1)
    if (await del.count()) { await del.click(); await wait(600) }
    P('R2 清理后墙上便签数=' + (await page.locator('.wall .note').count()))
  } catch (e) { P('R2 FAIL ' + (e && e.message)) }

  /* ---- 兜底：树上至少得有一个目标，R3 / R4 都靠它（空库时自己种一个，跑完删掉） ---- */
  let seededGoalId = null
  try {
    await remount('#/goals')
    if (!(await page.locator('.tree-card .gnode .gmain').count())) {
      seededGoalId = await page.evaluate(async (d) => {
        const g = await window.api.goals.create({ title: '验证目标', domain: d })
        return g && g.id ? g.id : null
      }, domain)
      await remount('#/goals')
      P('R0 种子目标 id=' + seededGoalId)
    }
  } catch (e) { P('R0 种子目标失败 ' + (e && e.message)) }

  /* ================= R3 资料库 ↔ 目标 ================= */
  let goalId = null, origDates = { start: '', due: '' }
  try {
    await remount('#/goals')
    await page.locator('.tree-card .gnode .gmain').first().click()
    await wait(900)
    const goalTitle = (await page.locator('.d-head h2').innerText()).trim()
    goalId = await page.evaluate(async ({ d, t }) => {
      const flat = (ns, acc = []) => { for (const n of ns) { acc.push(n); if (n.children?.length) flat(n.children, acc) } return acc }
      const tree = await window.api.goals.tree(d)
      const g = flat(tree).find((x) => x.title === t)
      return g ? g.id : null
    }, { d: domain, t: goalTitle })
    origDates = await page.evaluate(async ({ d, id }) => {
      const flat = (ns, acc = []) => { for (const n of ns) { acc.push(n); if (n.children?.length) flat(n.children, acc) } return acc }
      const g = flat(await window.api.goals.tree(d)).find((x) => x.id === id)
      return { start: g?.start_date || '', due: g?.due_date || '' }
    }, { d: domain, id: goalId })
    P('R3 目标 ' + goalTitle + ' id=' + goalId + ' 原时间=' + JSON.stringify(origDates))

    P('R3 面板存在=' + (await page.locator('.mlp').count()))
    const beforeCnt = await page.locator('.mlp-item').count()
    await page.locator('.mlp-head .btn').first().click()   // 关联已有
    await wait(900)
    let cand = await page.locator('.pick-row').count()
    if (cand) {
      const t = (await page.locator('.pick-row .mi-title').first().innerText()).trim()
      await page.locator('.pick-row').first().click()
      await wait(900)
      P('R3 关联已有：' + t)
    } else {
      await page.locator('.overlay .modal-foot .btn').first().click()   // 关闭 picker
      await wait(400)
      await page.locator('.mlp-head .btn').nth(1).click()               // 新建资料
      await wait(500)
      await page.locator('.overlay .modal input.input').nth(0).fill('验证资料 ' + Date.now())
      await page.locator('.overlay .modal-foot .btn.primary').click()
      await wait(900)
      P('R3 新建并关联了一份资料')
    }
    const afterCnt = await page.locator('.mlp-item').count()
    P('R3 面板条目 ' + beforeCnt + ' -> ' + afterCnt)
    const viaApi = await page.evaluate(async (id) => (await window.api.materials.forGoal(id)).map((m) => ({ id: m.id, title: m.title, goal_id: m.goal_id })), goalId)
    P('R3 库里 forGoal=' + JSON.stringify(viaApi))
    await page.screenshot({ path: path.join(OUT, 'goals-materials.png') })

    // 资料库里应该看到「目标 · xxx」标签
    await remount('#/library')
    const tag = await page.evaluate(() => Array.from(document.querySelectorAll('.m-link')).map((e) => e.textContent.trim()))
    P('R3 资料库关联标签=' + JSON.stringify(tag.slice(0, 6)))

    // 反向：在资料库里改关联（下拉里应该同时有「目标 ·」和「路线 ·」两组）
    if (await page.locator('.m-card').count()) {
      await page.locator('.m-card .m-ops .btn.ghost').first().click()
      await wait(600)
      await page.locator('.overlay .modal .sel').nth(1).click()
      await wait(500)
      const selOpts = await page.evaluate(() => Array.from(document.querySelectorAll('.sel-opt')).map((e) => e.textContent.trim()))
      P('R3 关联下拉 ' + JSON.stringify(selOpts.slice(0, 6)))
      await page.keyboard.press('Escape')
      await wait(400)
      await page.locator('.overlay .modal-foot .btn').first().click()   // 取消
      await wait(400)
    }
    await page.screenshot({ path: path.join(OUT, 'library-link.png') })

    // ---- 路线页的资料面板（走 materials:forNode）----
    await remount('#/routes')
    let madeRoot2 = false, madeNode2 = false
    const rNew = async (text) => {
      await page.locator('.overlay .modal input.input').fill(text)
      await page.locator('.overlay .modal-foot .btn.primary').click()
      await wait(900)
    }
    if (!(await page.locator('.domain-tabs .dtab:not(.add)').count())) {
      await page.locator('.page-head .btn.primary').first().click(); await wait(400)
      await rNew('资料验证路线'); madeRoot2 = true
    }
    if (!(await page.locator('.col-tree .rnode').count())) {
      await page.locator('.col-head .ch-ops button[title="加一个顶层节点"]').first().click(); await wait(400)
      await rNew('资料验证节点'); madeNode2 = true
    }
    await page.locator('.col-tree .rnode').first().locator('.prog').click()
    await wait(900)
    P('R3 路线页面板存在=' + (await page.locator('.mlp').count()))
    // 用「新建资料」走一遍：库里有新记录 + 挂在节点上
    await page.locator('.mlp-head .btn').nth(1).click()
    await wait(500)
    const routeMatTitle = '验证路线资料 ' + Date.now()
    await page.locator('.overlay .modal input.input').nth(0).fill(routeMatTitle)
    await page.locator('.overlay .modal-foot .btn.primary').click()
    await wait(900)
    const nodeId = await page.evaluate(async (d) => {
      const flat = (ns, acc = []) => { for (const n of ns) { acc.push(n); if (n.children?.length) flat(n.children, acc) } return acc }
      const t = flat(await window.api.routes.tree(d))
      return t.length ? t[0].id : null
    }, domain)
    const forNode = await page.evaluate(async (id) => (await window.api.materials.forNode(id)).map((m) => ({ id: m.id, title: m.title, route_node_id: m.route_node_id })), nodeId)
    P('R3 路线 forNode=' + JSON.stringify(forNode))
    P('R3 路线面板条目=' + (await page.locator('.mlp-item').count()))
    await page.screenshot({ path: path.join(OUT, 'routes-materials.png') })

    // 清理：资料库里删掉刚建的这份，再删掉验证节点 / 路线
    await remount('#/library')
    const card = page.locator('.m-card', { hasText: routeMatTitle })
    if (await card.count()) {
      await card.first().locator('.m-ops .btn.ghost').nth(1).click()
      await wait(500); await page.locator('.cf-ok').click(); await wait(700)
      P('R3 已从资料库删除 ' + routeMatTitle)
    }
    await go('#/routes')
    const delR = async (name) => {
      const i = await page.evaluate((t) => {
        const rows = Array.from(document.querySelectorAll('.col-tree .rnode'))
        return rows.findIndex((r) => (r.querySelector('.rtitle')?.value || '') === t)
      }, name)
      if (i < 0) return
      await page.locator('.col-tree .rnode').nth(i).locator('.rops button.del').click()
      await wait(500); await page.locator('.cf-ok').click(); await wait(800)
    }
    if (madeNode2) await delR('资料验证节点')
    if (madeRoot2) {
      const btn = page.locator('.col-head .ch-ops button[title="删除整条路线"]')
      if (await btn.count()) { await btn.click(); await wait(500); await page.locator('.cf-ok').click(); await wait(800) }
    }
    P('R3 路线清理完成')
  } catch (e) { P('R3 FAIL ' + (e && e.message)) }

  /* ================= R4 目标起始时间 + 时间量化提醒 ================= */
  try {
    await go('#/goals')
    await page.locator('.tree-card .gnode .gmain').first().click()
    await wait(900)
    const now = new Date()
    const start = fmtD(new Date(now.getTime() - 30 * 86400000))
    const dueSoon = fmtD(new Date(now.getTime() + 3 * 86400000))
    await page.locator('.edit-form input[type="date"]').nth(0).fill(start)
    await page.locator('.edit-form input[type="date"]').nth(1).fill(dueSoon)
    await page.locator('.edit-form .edit-actions .btn.primary').first().click()
    await wait(1200)
    const soon = await page.evaluate(() => ({
      has: !!document.querySelector('.tp'),
      range: document.querySelector('.tp-range')?.textContent.trim() || '',
      notes: Array.from(document.querySelectorAll('.tp-note')).map((e) => e.textContent.trim()),
      bars: Array.from(document.querySelectorAll('.tp-bar')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      treeChip: document.querySelector('.tree-card .late')?.textContent.trim() || ''
    }))
    P('R4 未过期 ' + JSON.stringify(soon))
    await page.screenshot({ path: path.join(OUT, 'goals-time-ok.png') })

    // 改成已过期，看警示
    const overdue = fmtD(new Date(now.getTime() - 5 * 86400000))
    await page.locator('.edit-form input[type="date"]').nth(1).fill(overdue)
    await page.locator('.edit-form .edit-actions .btn.primary').first().click()
    await wait(1200)
    const late = await page.evaluate(() => ({
      notes: Array.from(document.querySelectorAll('.tp-note')).map((e) => e.textContent.trim()),
      tones: Array.from(document.querySelectorAll('.tp-note')).map((e) => e.className),
      treeChip: document.querySelector('.tree-card .late')?.textContent.trim() || ''
    }))
    P('R4 已过期 ' + JSON.stringify(late))
    await page.screenshot({ path: path.join(OUT, 'goals-time-overdue.png') })

    // 还原原来的时间设置
    await page.locator('.edit-form input[type="date"]').nth(0).fill(origDates.start)
    await page.locator('.edit-form input[type="date"]').nth(1).fill(origDates.due)
    await page.locator('.edit-form .edit-actions .btn.primary').first().click()
    await wait(1000)
    P('R4 还原为 ' + JSON.stringify(origDates))
    await page.screenshot({ path: path.join(OUT, 'goals-time-restored.png') })
  } catch (e) { P('R4 FAIL ' + (e && e.message)) }

  /* ---- 清掉这次验证留下的东西 ---- */
  try {
    const leftovers = await page.evaluate(async () => {
      const out = []
      const mats = await window.api.materials.list()
      for (const m of mats) if (String(m.title).includes('验证')) out.push(['material', m.id, m.title])
      for (const [kind, id, title] of out) {
        if (kind === 'material') await window.api.materials.remove(id)
      }
      return out
    })
    if (leftovers.length) P('清理残留 ' + JSON.stringify(leftovers))
    if (seededGoalId) {
      await page.evaluate(async (id) => { await window.api.goals.remove(id) }, seededGoalId)
      P('已删除种子目标 ' + seededGoalId)
    }
  } catch (e) { P('清理残留失败 ' + (e && e.message)) }

  P('ERRORS ' + JSON.stringify(errs.slice(0, 10)))
  fs.writeFileSync(path.join(ROOT, 'tools', 'req-report.txt'), lines.join('\n') + '\n')
  process.exit(0)
}
main().catch((e) => {
  P('FAIL ' + (e && e.message))
  try { fs.writeFileSync(path.join(ROOT, 'tools', 'req-report.txt'), lines.join('\n') + '\n') } catch {}
  process.exit(1)
})
