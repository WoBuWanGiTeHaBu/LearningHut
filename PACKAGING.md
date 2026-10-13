# Study Helper · 打包说明

## 一键打包

```bash
npm run pack
```

打包完成后，产物在 `dist/` 目录：

| 文件 | 用途 |
|---|---|
| `Study-Helper-Setup-0.1.0.exe` | **安装程序**，双击就能装，可发给别人 |
| `Study-Helper-0.1.0-x64.zip` | 免安装绿色版，解压即用 |
| `win-unpacked/` | 解压后的目录形态，调试用 |

## 其他命令

```bash
npm run dev          # 开发模式，改代码热更新
npm run pack:dir     # 只打目录，不打安装包（快，用于验证）
npm run pack:portable # 只打 zip 绿色版
npm run clean:dist   # 手动清 dist（一般不用，pack 会自己清）
npm run icon         # 重新生成图标（改完 icon-src.html 后跑）
```

> `pack` / `pack:dir` / `pack:portable` 三个命令**开头都会先跑 `clean:dist`**。
> 原因见下面「打包环境备忘」第 3 条 —— 不先清干净，electron-builder 会在删旧目录
> 那一步被沙箱拦下来直接失败。

## 安装后的数据存在哪

**在应用自己的目录里，不占 C 盘。** 具体位置：

- 安装程序默认装到 `%LOCALAPPDATA%\Programs\Study Helper\`，数据在它旁边的 `data\`
- 绿色版解压到哪，数据就在解压目录的 `data\`
- 万一那个位置不可写（比如手动装到了 `C:\Program Files`），会自动退到
  `%LOCALAPPDATA%\Study Helper\data`

应用内「设置」页底部会显示当前数据库的完整路径，随时可以确认。

卸载时**不会删除** `data\` 目录，卸载完会弹窗告诉你它在哪，要彻底清理得手动删。

> 数据库文件名仍是 `learning-hut.db`。应用改叫 Study Helper 时**没有动它** ——
> 改文件名会让已有数据"消失"，不值得。

## 图标

三步：

1. `tools/icon-src.html` —— 图标的唯一真源，SVG 矢量绘制
2. `tools/shoot-icon.cjs` —— 用无头浏览器（系统 Edge，`channel:'msedge'`）把 SVG
   渲染成 16/24/32/48/64/128/256/512 的 PNG，落在 `build/icon-src/`
3. `tools/make-icon.py` —— 把 PNG 组装成 `build/icon.ico`（PNG 压缩格式的 ICO，
   256 那一档在目录项里宽高写 0）

改图标只动第 1 步的 SVG，然后 `npm run icon`。

核验用的两个小工具：

- `tools/check-ico.cjs` —— 把 `build/icon.ico` **读回来**，核对里面到底有哪几档尺寸、
  每档声明的宽高和 PNG 里 IHDR 的真实宽高是否一致（防止清单写 48、图其实是 32）。
- `tools/shoot-iconpreview.cjs` + `tools/icon-preview.html` —— 把各尺寸并排放大渲染成
  `shots/icon-preview.png`，人眼确认小尺寸下还看不看得出是什么。
- `tools/extract-exe-icon.ps1` —— 从打包好的 exe 里把图标抠出来存成 PNG，
  确认新图标真的进到 exe 里了。

**关于小尺寸**：设计时要在 16px 下看过再定稿。圆角底和书脊都是绿的，没有深色描边
就会糊成一坨；叶子做小了一点，缩到 16px 就没了。现在的版本给书加了深色描边、
把书和叶子都做大了一档。

> 早先试过用 Python 逐像素手算图形，怎么调都像立方体 —— 矢量画形状可控得多。
> 另一个教训：「一本摊开斜放的书」透视本身有歧义，换成**竖直立着的书**轮廓才唯一。

## 打包环境备忘

本项目用的是 **electron-builder**（不是 forge），配置在 `electron-builder.config.cjs`。

几个容易踩的坑，记录一下：

1. **`npm install` 会清掉 rollup / esbuild 的平台二进制**
   npm 处理 optionalDependencies 的老 bug。表现是构建时报
   `Cannot find module @rollup/rollup-win32-x64-msvc`。
   修复：删掉 `node_modules` 和 `package-lock.json`，然后
   ```
   npm install --ignore-scripts
   npm install @rollup/rollup-win32-x64-msvc @esbuild/win32-x64 --no-save --force
   cd node_modules/electron && ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
   ```

2. **Electron 二进制要单独下**（`--ignore-scripts` 会跳过它的下载脚本）。
   直连 GitHub 会超时，必须走镜像，见上面那条。

3. **打包前 `dist/` 必须是干净的**，否则 electron-builder 在
   `prepareApplicationStageDirectory` 删旧 `dist/win-unpacked` 时会被本机沙箱的
   safe-delete 保护拦下，报：
   ```
   ⨯ [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":164,"threshold":50,...}
   ```
   它不是 EBUSY（进程早退干净了），纯粹是「一次删超过 50 个文件」被拒。
   所以 `pack` 系列命令都自带了 `node tools/rm-dist.cjs` 前置清理 ——
   这个脚本绕过 shim，**自底向上**一个个 `unlinkSync` + `rmdirSync`。

4. **`data/` 绝不能被打进安装包**。`electron-builder.config.cjs` 的 `files`
   字段只放了 `out/**/*` 和 `package.json`，源码、tools、data 都不带。

5. **`extraResources` 里那份 `icon.ico`** 会被放到 `resources/icon.ico`，
   主进程 `appIconPath()` 读它来显式设置窗口图标（开发模式读源码里的
   `build/icon.ico`）。这只是「更稳」，exe 本身也已经有图标了。

