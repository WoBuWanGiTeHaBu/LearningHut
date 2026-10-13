/* 层级规则 + 角标刷新的真机验证：
   S1 学习路线页：顶层节点有「含下级 / 只看本层」切换（默认含下级，分组显示）；
      子节点（哪怕下面还有孙节点挂着资料）只显示自己这层直挂的；
      面板里取消关联后，树上的资料角标跟着刷新
   S2 目标页：同样的层级规则
   用法：bash tools/run-ui-verify.sh tools/cdp-split.cjs
   结果写 tools/req-report.txt，图在 shots-req/ */
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots-req')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const lines = []
const P = (...a) => { const s = a.join(' '); lines.push(s); console.log(s) }

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
  const remount = async (h) => { await go('#/settings'); await go(h) }
  const domain = await page.evaluate(() => localStorage.getItem('sh-domain') || 'study')

  const panelState = () => page.evaluate(() => ({
    seg: !!document.querySelector('.mlp-seg'),
    segOn: document.querySelector('.mlp-seg button.on')?.textContent?.trim() || '',
    heads: Array.from(document.querySelectorAll('.mlp-ghead')).map((e) => e.textContent.trim()),
    items: document.querySelectorAll('.mlp-item').length,
    sub: document.querySelectorAll('.mlp-item.sub').length,
    empty: document.querySelector('.mlp-empty')?.textContent?.trim() || ''
  }))
  // 路线行的标题在 input 的 value 里，hasText 匹配不到 —— 按值找索引
  const routeRowIdx = (title) => page.evaluate((t) => {
    const rows = Array.from(document.querySelectorAll('.col-tree .rnode'))
    return rows.findIndex((r) => r.querySelector('.rtitle')?.value === t)
  }, title)

  /* ================= S1 学习路线页 ================= */
  const W = { mats: [], nodes: [] }
  try {
    await remount('#/routes')
    // 种：路线 → 子 → 孙；资料分别直挂三层
    W.nodes.push(await page.evaluate(async (d) =>
      (await window.api.routes.create({ parent_id: null, title: '分栏验证路线', domain: d })).id, domain))
    W.nodes.push(await page.evaluate(async (p) =>
      (await window.api.routes.create({ parent_id: p, title: '分栏验证子节点' })).id, W.nodes[0]))
    W.nodes.push(await page.evaluate(async (p) =>
      (await window.api.routes.create({ parent_id: p, title: '分栏验证孙节点' })).id, W.nodes[1]))
    const mk = (nid, title) => page.evaluate(async ({ nid, title }) =>
      (await window.api.materials.create({
        type: 'web', title, domain: 'study',
        source: 'https://example.com/' + title, goal_id: null, route_node_id: nid
      })).id, { nid, title })
    W.mats.push(await mk(W.nodes[0], '分栏资料-顶层'))
    W.mats.push(await mk(W.nodes[1], '分栏资料-子层'))
    W.mats.push(await mk(W.nodes[2], '分栏资料-孙层'))
    await remount('#/routes')
    await wait(500)

    // 顶层：默认「含下级」，分两组（本层级1 / 含下级2）
    let st = await panelState()
    P('S1 顶层 ' + JSON.stringify(st))
    P('S1 顶层默认含下级分组 ' + (st.seg && st.segOn === '含下级' && st.heads.length === 2
      && st.heads[0].startsWith('本层级') && st.heads[1].startsWith('含下级')
      && st.items === 3 && st.sub === 2 ? 'PASS' : 'FAIL'))
    await page.screenshot({ path: path.join(OUT, 'split-routes-top.png') })

    // 顶层切「只看本层」→ 只剩直挂的 1 条，无分组标题
    await page.locator('.mlp-seg button', { hasText: '只看本层' }).click()
    await wait(500)
    st = await panelState()
    P('S1 顶层只看本层 ' + JSON.stringify(st))
    P('S1 顶层切换 ' + (st.seg && st.heads.length === 0 && st.items === 1 && st.sub === 0 ? 'PASS' : 'FAIL'))

    // 子节点：没有切换，只显示自己这层直挂的（孙层的资料不出现）
    const kidIdx = await routeRowIdx('分栏验证子节点')
    await page.locator('.col-tree .rnode').nth(kidIdx).locator('.prog').click()
    await wait(700)
    st = await panelState()
    P('S1 子节点 ' + JSON.stringify(st))
    P('S1 子节点只看本层 ' + (!st.seg && st.heads.length === 0 && st.items === 1 && st.sub === 0 ? 'PASS' : 'FAIL'))
    await page.screenshot({ path: path.join(OUT, 'split-routes-child.png') })

    // 角标刷新：顶层面板里取消关联 → 树重拉 → mat_count 从 3 变 2
    const rootIdx = await routeRowIdx('分栏验证路线')
    await page.locator('.col-tree .rnode').nth(rootIdx).locator('.prog').click()
    await wait(700)
    const beforeCnt = await page.evaluate(async (id) =>
      (await window.api.routes.tree()).find((r) => r.id === id)?.mat_count, W.nodes[0])
    await page.locator('.mlp-item .del').first().click()
    await wait(1200)
    const afterCnt = await page.evaluate(async (id) =>
      (await window.api.routes.tree()).find((r) => r.id === id)?.mat_count, W.nodes[0])
    P('S1 角标 ' + beforeCnt + ' -> ' + afterCnt + (beforeCnt === 3 && afterCnt === 2 ? ' PASS' : ' FAIL'))
  } catch (e) { P('S1 ERROR ' + e.message) }

  /* ================= S2 目标页 ================= */
  const G = { mats: [], goals: [] }
  try {
    await remount('#/goals')
    G.goals.push(await page.evaluate(async (d) =>
      (await window.api.goals.create({ title: '分栏验证目标', domain: d })).id, domain))
    G.goals.push(await page.evaluate(async (p) =>
      (await window.api.goals.create({ title: '分栏验证子目标', parent_id: p })).id, G.goals[0]))
    G.goals.push(await page.evaluate(async (p) =>
      (await window.api.goals.create({ title: '分栏验证孙目标', parent_id: p })).id, G.goals[1]))
    const mkg = (gid, title) => page.evaluate(async ({ gid, title }) =>
      (await window.api.materials.create({
        type: 'web', title, domain: 'study',
        source: 'https://example.com/' + title, goal_id: gid, route_node_id: null
      })).id, { gid, title })
    G.mats.push(await mkg(G.goals[0], '分栏资料-目标顶层'))
    G.mats.push(await mkg(G.goals[1], '分栏资料-目标子层'))
    G.mats.push(await mkg(G.goals[2], '分栏资料-目标孙层'))
    await remount('#/goals')
    await page.locator('.tree-card .gnode', { hasText: '分栏验证目标' }).first().locator('.gmain').click()
    await wait(900)

    let st2 = await panelState()
    P('S2 顶层 ' + JSON.stringify(st2))
    P('S2 顶层默认含下级分组 ' + (st2.seg && st2.segOn === '含下级' && st2.heads.length === 2 && st2.items === 3 ? 'PASS' : 'FAIL'))
    await page.screenshot({ path: path.join(OUT, 'split-goals-top.png') })

    // 目标树初始不展开 —— 先点开顶层，再选子目标
    await page.locator('.tree-card .gnode', { hasText: '分栏验证目标' }).first().locator('button.tw').click()
    await wait(500)
    await page.locator('.tree-card .gnode', { hasText: '分栏验证子目标' }).first().locator('.gmain').click()
    await wait(900)
    st2 = await panelState()
    P('S2 子目标 ' + JSON.stringify(st2))
    P('S2 子目标只看本层 ' + (!st2.seg && st2.heads.length === 0 && st2.items === 1 && st2.sub === 0 ? 'PASS' : 'FAIL'))
  } catch (e) { P('S2 ERROR ' + e.message) }

  /* ================= 清理 ================= */
  try {
    for (const id of W.mats) await page.evaluate(async (i) => { await window.api.materials.remove(i) }, id)
    for (const id of G.mats) await page.evaluate(async (i) => { await window.api.materials.remove(i) }, id)
    for (const id of [...W.nodes].reverse()) await page.evaluate(async (i) => { await window.api.routes.remove(i) }, id)
    for (const id of [...G.goals].reverse()) await page.evaluate(async (i) => { await window.api.goals.remove(i) }, id)
    P('CLEANUP 资料=' + (W.mats.length + G.mats.length) + ' 路线=' + W.nodes.length + ' 目标=' + G.goals.length)
  } catch (e) { P('CLEANUP ERROR ' + e.message) }

  P('PAGE_ERRORS ' + JSON.stringify(errs.slice(0, 10)))
  fs.writeFileSync(path.join(ROOT, 'tools', 'req-report.txt'), lines.join('\n'))
}

main().catch((e) => { console.log('FAIL', e.message, e.stack?.slice(0, 600)); process.exit(1) })
