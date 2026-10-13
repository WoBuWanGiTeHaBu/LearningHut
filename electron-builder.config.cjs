// electron-builder 打包配置
// 产出：dist/ 下 免安装绿色版（win-unpacked / zip）+ NSIS 安装包（exe）
const path = require('node:path')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'cn.shen.studyhelper',
  productName: 'Study Helper',
  copyright: 'Copyright © 2026',

  // 只把构建产物 + package.json 装进去，源码 / tools / data 一律不带
  files: [
    'out/**/*',
    'package.json',
    '!**/*.map',
    '!node_modules/.cache/**'
  ],

  // 打包时额外要带进去的静态资源（放到 resources/ 下随包分发）
  // icon.ico 单独放一份：主进程会读它来显式设置窗口/任务栏图标
  // （exe 自身也有图标，但显式指定更稳，也方便将来换图标不用重打包 exe）
  extraResources: [
    { from: 'build/icon.ico', to: 'icon.ico' }
  ],

  directories: {
    output: 'dist',
    buildResources: 'build'
  },

  // Windows 目标
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] }
    ],
    icon: 'build/icon.ico',
    // 免安装版用户可能直接跑 exe，需要管理员以外的普通权限即可写入同级 data/
    requestedExecutionLevel: 'asInvoker',
    // 产物名用连字符，避免空格带来的下载/脚本麻烦
    artifactName: 'Study-Helper-${version}-${arch}.${ext}'
  },

  nsis: {
    oneClick: false,               // 给用户选安装目录的机会
    perMachine: false,             // 装到当前用户，不需要管理员
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Study Helper',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    // 卸载时保留 data/（用户的学习数据不能跟着卸载一起没）
    deleteAppDataOnUninstall: false,
    artifactName: 'Study-Helper-Setup-${version}.${ext}',
    // 卸载时提示数据目录位置
    include: 'build/installer.nsh'
  },

  // 关掉自动更新的默认行为，用户手动装新版
  publish: null
}
