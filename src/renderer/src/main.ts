/// <reference types="vite/client" />
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { api } from './api'
import { applyTheme, cachedTheme } from './theme'
import './styles/main.css'

// 非 Electron 环境（纯浏览器预览）时安装 mock
if (!(window as any).api) {
  // eslint-disable-next-line
  import('./mock').then(m => m.installMock()).then(startApp)
} else {
  startApp()
}

function startApp() {
  // 先用本地缓存上色（不闪默认色），再问库里记的主题
  applyTheme(cachedTheme())
  createApp(App).use(router).mount('#app')
  api.settings.get('theme')
    .then((t) => { if (t) applyTheme(t) })
    .catch(() => { /* 拿不到就沿用缓存 */ })
}
