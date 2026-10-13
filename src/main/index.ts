// 主进程入口
import { app, BrowserWindow, Menu, protocol, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerIpc } from './ipc'
import { setMainWindow } from './ipc'
import { openDb, getSetting } from './db'
import { chromeFor } from '../shared/theme'

app.setName('Study Helper')

// 数据目录一律放在应用自己所在的位置，不占 C 盘：
//   开发时 = 项目根/data        打包后 = exe 同级/data（绿色版）
//   装到 Program Files 写不进去时，退回 %LOCALAPPDATA%\Study Helper\data
// 必须在 openDb() 之前设置，否则数据库会落在 %APPDATA%。
function setupDataDir() {
  const fallbackDir = path.join(localAppDataDir(), 'Study Helper', 'data')

  let dataDir = fallbackDir
  try {
    const root = app.isPackaged
      ? path.dirname(app.getPath('exe'))
      : path.join(app.getAppPath())
    const wanted = path.join(root, 'data')
    // 先试探：绿色版放 exe 旁边；如果那个位置不可写（比如装在 Program Files），
    // 就不能硬来 —— 否则用户「记了但没保存」会非常难排查。
    if (isWritable(wanted)) {
      dataDir = wanted
    } else {
      console.warn('[app] 应用目录不可写，数据改放', fallbackDir)
    }
  } catch (e) {
    console.error('[app] 计算数据目录失败，退到', fallbackDir, e)
  }

  try {
    const existed = fs.existsSync(path.join(dataDir, 'learning-hut.db'))
    fs.mkdirSync(dataDir, { recursive: true })
    // session / tmp 这两个子目录必须先建出来，Chromium 只会往里写文件、不会自己创建目录，
    // 缺了它就会报 "Error writing DevTools active port ... 系统找不到指定的路径"。
    fs.mkdirSync(path.join(dataDir, 'session'), { recursive: true })
    fs.mkdirSync(path.join(dataDir, 'tmp'), { recursive: true })
    // 开发模式下把历史遗留的 %APPDATA%\LearningHut 数据搬过来
    migrateLegacyData(dataDir, existed)
    app.setPath('userData', dataDir)
    app.setPath('sessionData', path.join(dataDir, 'session'))
    app.setPath('temp', path.join(dataDir, 'tmp'))
    console.log('[app] 数据目录：', dataDir)
  } catch (e) {
    console.error('[app] 无法把数据目录切到', dataDir, e)
  }
}

// %LOCALAPPDATA% 的取法。
// 注意：Electron 37 **没有** 'localAppData' 这个 path name，
// app.getPath('localAppData') 会抛 `Failed to get 'localAppData' path`
// （实测见 tools/probe-paths.cjs）。所以只能读环境变量；
// 万一环境变量也没有（理论上不该发生），就按 AppData\Roaming\..\Local 推。
function localAppDataDir(): string {
  const env = process.env.LOCALAPPDATA
  if (env) return env
  try { return path.join(app.getPath('appData'), '..', 'Local') } catch { return app.getPath('temp') }
}

// 目录是否可写：存在就试写一个探针文件；不存在就看它能不能被创建出来
function isWritable(dir: string): boolean {
  try {
    if (fs.existsSync(dir)) {
      const probe = path.join(dir, '.write-probe')
      fs.writeFileSync(probe, 'ok')
      fs.unlinkSync(probe)
      return true
    }
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, '.write-probe')
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

// 把旧的 %APPDATA%\LearningHut 数据搬到新目录。
// 只在开发模式（未打包）下做：这是当年开发期把库放在 %APPDATA% 留下的历史包袱，
// 对正式安装的用户来说没有意义，反而会把开发机上的测试库搬进发行版。
function migrateLegacyData(dataDir: string, alreadyHasDb: boolean) {
  if (alreadyHasDb) return
  if (app.isPackaged) return
  const legacy = path.join(app.getPath('appData'), 'LearningHut') // %APPDATA%\LearningHut
  if (path.resolve(legacy) === path.resolve(dataDir)) return
  const legacyDb = path.join(legacy, 'learning-hut.db')
  if (!fs.existsSync(legacyDb)) return
  const copyDir = (from: string, to: string) => {
    if (!fs.existsSync(from)) return
    fs.mkdirSync(to, { recursive: true })
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, e.name)
      if (e.isDirectory()) copyDir(src, path.join(to, e.name))
      else {
        // 一定连 -wal / -shm 一起搬：老库可能是 WAL 模式，最新数据还在 -wal 里，
        // 只搬主库会丢最近的写入。拷过去 SQLite 打开时会自己恢复。
        const dst = path.join(to, e.name)
        if (!fs.existsSync(dst) || fs.statSync(src).size > fs.statSync(dst).size) {
          try { fs.copyFileSync(src, dst) } catch (err) { console.error('[migrate] copy failed', src, err) }
        }
      }
    }
  }
  try {
    // 主库 + 备份 + 导入的资料文件一起搬
    copyDir(legacy, dataDir)
    console.log('[app] 已把旧数据从', legacy, '迁移到', dataDir)
  } catch (e) {
    console.error('[app] 旧数据迁移失败', e)
  }
}

setupDataDir()

// 媒体协议：BGM 音频流（支持 Range）
protocol.registerSchemesAsPrivileged([
  { scheme: 'lh-media', privileges: { stream: true, supportFetchAPI: true } }
])

// 窗口图标。
// 打包后：exe 本身已经被 electron-builder 打上了 icon.ico，Windows 会用它，
//         但显式给上更稳（任务栏 / Alt-Tab 不受 exe 资源影响）。
// 开发时：没有 exe 图标可用，不显式指定就会顶着一个 Electron 默认图标，
//         所以这里回落到源码里的 build/icon.ico。
function appIconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.ico')]
    : [path.join(app.getAppPath(), 'build', 'icon.ico')]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch { /* 忽略，继续找下一个 */ }
  }
  return undefined
}

function createWindow() {
  // 窗口底色跟随「上次记住的主题」，避免启动瞬间闪白。
  const chrome = chromeFor(getSetting('theme'))
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    icon: appIconPath(),
    // 纯无边框：窗控按钮由渲染层自绘（TitleBar.vue）。
    // 曾经用 titleBarStyle:'hidden' + titleBarOverlay 让系统画按钮，
    // 但系统画的那一条永远压在网页之上——弹窗遮罩盖不住右上角，
    // 换主题还得回主进程调 setTitleBarOverlay 补色，所以弃用。
    frame: false,
    // 关掉 Win11 的圆角：圆角处会露出窗口后面的桌面，
    // 弹窗遮罩一压暗，四角就像「没盖住」。方角后只剩 1px 边框区。
    roundedCorners: false,
    backgroundColor: chrome.color,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  setMainWindow(win)

  // 最大化状态变化 → 通知渲染层换「最大化 / 还原」图标
  const emitMax = () => {
    if (!win.isDestroyed()) win.webContents.send('win:max-changed', win.isMaximized())
  }
  win.on('maximize', emitMax)
  win.on('unmaximize', emitMax)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  win.once('ready-to-show', () => win.show())
  return win
}

// 单实例：重复启动时把已有窗口唤到前面，而不是再开一个（避免"打开了旧窗口"的错觉）
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    }
  })
  bootstrap()
}

function bootstrap() {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    // BGM 流媒体协议
    protocol.handle('lh-media', (request) => {
      const p = decodeURIComponent(new URL(request.url).pathname)
      return net.fetch('file://' + p.replace(/^\/([A-Za-z]:)/, '$1'))
    })

    openDb() // 提前建库，确保 IPC 就绪时可用
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
