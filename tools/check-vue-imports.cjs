#!/usr/bin/env node
/*
 * 静态兜底：抓「用了 Composition API 却没 import」这类错误。
 *
 * 为什么需要它：electron-vite / vite 用 esbuild 只做转译，**不做类型检查也不做未定义变量检查**。
 * HeatMap.vue 少了 `import { watch }`，构建照样 EXIT=0，直到运行时 setup() 抛
 * `ReferenceError: watch is not defined`，组件才渲染成 <!----> ——
 * 表现是「页面某块内容凭空消失」，而且报错发生在挂载期，CDP 连上去时已经错过了。
 *
 * 用法：node tools/check-vue-imports.cjs
 * 退出码 1 表示发现问题。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'src', 'renderer', 'src')

// 需要显式 import 的 Vue 运行时标识符（defineXxx 是编译宏，不用 import）
const NEED_IMPORT = [
  'ref', 'shallowRef', 'reactive', 'shallowReactive', 'readonly',
  'computed', 'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect',
  'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount',
  'onActivated', 'onDeactivated', 'onUpdated', 'onBeforeUpdate',
  'nextTick', 'provide', 'inject', 'toRef', 'toRefs', 'toRaw', 'unref',
  'markRaw', 'getCurrentInstance', 'useSlots', 'useAttrs', 'triggerRef',
  'customRef', 'effectScope', 'onErrorCaptured'
]

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const problems = []

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')

  // script setup 块
  const m = src.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/)
  if (!m) continue
  const script = m[1]
  const scriptStart = src.slice(0, src.indexOf(m[0])).split('\n').length

  // 模板块（模板里用到的也必须在 script setup 作用域里可见）
  const tm = src.match(/<template>([\s\S]*?)<\/template>/)
  const template = tm ? tm[1] : ''

  // 从 'vue' 导入的名字
  const imported = new Set()
  for (const im of script.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/g)) {
    im[1].split(',').forEach((raw) => {
      const name = raw.trim().split(/\s+as\s+/).pop().trim()
      if (name) imported.add(name)
    })
  }
  // 整包导入（import * as vue）就跳过这个文件
  if (/import\s+\*\s+as\s+\w+\s+from\s*['"]vue['"]/.test(script)) continue

  for (const name of NEED_IMPORT) {
    if (imported.has(name)) continue
    // script 里：去掉 import 行后找 `name(` 或 `name.`（排除对象属性 xxx.name）
    const stripped = script
      .split('\n')
      .filter((l) => !/^\s*import\b/.test(l))
      .join('\n')
    const usedInScript = new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(stripped)
    const usedInTmpl = template && new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(template)
    if (usedInScript || usedInTmpl) {
      const lineNo = scriptStart + stripped.split('\n').findIndex((l) => new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(l))
      problems.push(`${path.relative(path.join(__dirname, '..'), file)}: 用了 ${name}(...) 但没从 vue import（约第 ${lineNo} 行）`)
    }
  }
}

if (problems.length) {
  console.log('❌ 发现 ' + problems.length + ' 处缺失 import：')
  problems.forEach((p) => console.log('  - ' + p))
  process.exit(1)
} else {
  console.log('✅ vue Composition API import 检查通过')
}
