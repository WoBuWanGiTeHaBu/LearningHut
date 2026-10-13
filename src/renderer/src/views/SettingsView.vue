<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import Icon from '../components/Icon.vue'
import { toast } from '../toast'
import { THEMES, DEFAULT_THEME, applyTheme, isTheme } from '../theme'

const profile = ref<{ nickname: string; bio: string }>({ nickname: '', bio: '' })
const bgmFolder = ref('')
const appInfo = ref<{ dbPath: string; version: string } | null>(null)

const theme = ref<string>(
  document.documentElement.getAttribute('data-theme') || DEFAULT_THEME
)
const currentName = computed(() => THEMES.find((t) => t.id === theme.value)?.name ?? '')

onMounted(async () => {
  profile.value = (await api.settings.get('profile')) || { nickname: '', bio: '' }
  bgmFolder.value = (await api.settings.get('bgm_folder')) || ''
  const saved = await api.settings.get('theme')
  if (isTheme(saved)) theme.value = saved
  appInfo.value = await api.appInfo()
})

async function saveProfile() {
  await api.settings.set('profile', profile.value)
  toast('已保存')
}

async function pickBgm() {
  const r = await api.bgm.setFolder()
  if (r) {
    bgmFolder.value = r.folder
    toast(`已导入 ${r.added} 首新曲目`)
    location.reload() // 重新初始化播放器
  }
}

async function chooseTheme(id: string) {
  if (id === theme.value) return
  theme.value = id
  applyTheme(id)                     // 立刻换色（同时写本地缓存）
  await api.settings.set('theme', id) // 记住选择
  toast(`已换成「${THEMES.find((t) => t.id === id)?.name}」`)
}

async function backup() {
  const p = await api.dialog.backupNow()
  if (p) toast('已备份到 ' + p)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>设置</h1>
      <span class="sub">个人资料 · 音乐 · 数据 · 主题</span>
    </div>

    <div class="grid">
      <!-- ---------------- 左栏 ---------------- -->
      <div class="col">
        <!-- 相框 · 个人资料 -->
        <div class="card pad">
          <div class="card-title">相框 · 个人资料</div>
          <div class="frame">
            <div class="frame-inner">
              <Icon name="leaf" :size="26" />
              <div class="f-nick">{{ profile.nickname || '无名氏' }}</div>
              <div class="f-bio">{{ profile.bio || '这里可以写一句自我介绍' }}</div>
            </div>
          </div>
          <div class="field" style="margin-top: 14px;">
            <label>称呼</label>
            <input v-model="profile.nickname" class="input" placeholder="怎么称呼你" />
          </div>
          <div class="field" style="margin-top: 10px;">
            <label>一句话介绍</label>
            <input v-model="profile.bio" class="input" />
          </div>
          <button class="btn primary sm" style="margin-top: 12px;" @click="saveProfile">保存</button>
        </div>

        <!-- 背景音乐 -->
        <div class="card pad">
          <div class="card-title">吉他 · 背景音乐</div>
          <p class="dim">从本地文件夹导入音乐，侧栏底部会出现迷你播放器。</p>
          <p class="dim path" v-if="bgmFolder">当前文件夹：{{ bgmFolder }}</p>
          <button class="btn sm" style="margin-top: 8px;" @click="pickBgm">
            <Icon name="folder" :size="13" /> {{ bgmFolder ? '换一个文件夹' : '选择音乐文件夹' }}
          </button>
        </div>

        <!-- 快捷键 · 小贴士 -->
        <div class="card pad">
          <div class="card-title">快捷键 · 小贴士</div>
          <div class="sc-row"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd><span class="sc-t">随时全局搜索</span></div>
          <div class="sc-row"><kbd>Esc</kbd><span class="sc-t">关掉当前弹窗 / 搜索框</span></div>
          <div class="sc-row"><kbd>Enter</kbd><span class="sc-t">输入标签时确认，也可以敲逗号</span></div>
          <div class="sc-row"><kbd>拖拽</kbd><span class="sc-t">随手记的便签能拖着换位置</span></div>
          <div class="sc-row"><Icon name="leaf" :size="12" /><span class="sc-t">便签右上角：叶子换纸色，垃圾桶撕掉</span></div>
        </div>
      </div>

      <!-- ---------------- 右栏 ---------------- -->
      <div class="col">
        <!-- 调色 · 主题 -->
        <div class="card pad">
          <div class="card-title">调色 · 主题</div>
          <p class="dim">
            挑一套配色，整个软件立刻换装 —— 当前是
            <b class="cur">{{ currentName }}</b>，选择会被记住。
          </p>
          <div class="th-grid">
            <button v-for="t in THEMES" :key="t.id" class="th"
              :class="{ on: theme === t.id }" @click="chooseTheme(t.id)">
              <!-- 迷你预览：挂上 data-theme，里面的变量就按这套色卡解析 -->
              <span class="th-prev" :data-theme="t.id">
                <span class="p-side"></span>
                <span class="p-main">
                  <span class="p-card">
                    <b class="p-h"></b>
                    <i class="p-l"></i>
                    <i class="p-l s"></i>
                    <span class="p-row">
                      <em class="p-chip"></em>
                      <em class="p-btn"></em>
                    </span>
                    <span class="p-bar"><i></i></span>
                  </span>
                </span>
              </span>
              <span class="th-bar">
                <i v-for="c in t.swatch" :key="c" :style="{ background: c }"></i>
              </span>
              <span class="th-meta">
                <span class="th-name">{{ t.name }}</span>
                <span class="th-desc">{{ t.desc }}</span>
              </span>
              <span v-if="theme === t.id" class="th-tick">✓</span>
            </button>
          </div>
        </div>

        <!-- 数据 -->
        <div class="card pad">
          <div class="card-title">数据</div>
          <p class="dim path">数据库位置：{{ appInfo?.dbPath }}</p>
          <p class="dim">每天首次启动自动备份（保留最近 14 份），所有数据随时可在「报表与导出」里导出。</p>
          <button class="btn sm" style="margin-top: 8px;" @click="backup">立即备份</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.06fr);
  gap: 16px;
  align-items: start;
  max-width: 1360px;
  margin: 0 auto;
  width: 100%;
}
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (max-width: 1080px) {
  .grid { grid-template-columns: 1fr; }
}

/* ---------- 相框 ---------- */
.frame {
  background: linear-gradient(150deg, var(--frame-a), var(--frame-b));
  border: 1px solid var(--frame-line);
  border-radius: 6px;
  padding: 8px;
  width: 250px;
  margin: 2px auto 0;
  box-shadow: var(--shadow-2);
  transform: rotate(-1.2deg);
  transition: background-color .24s ease, border-color .24s ease;
}
.frame-inner {
  border: 1px dashed var(--frame-dash);
  border-radius: 4px;
  padding: 22px 18px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  color: var(--deep);
  text-align: center;
}
.f-nick { font-size: 17px; font-weight: 650; color: var(--ink); font-family: "KaiTi", "STKaiti", serif; }
.f-bio { font-size: 12.5px; color: var(--ink-3); font-family: "KaiTi", "STKaiti", serif; }
.dim { font-size: 12.5px; color: var(--ink-3); margin-bottom: 4px; }
.dim.path { word-break: break-all; }
.cur { color: var(--deep); font-weight: 650; }

/* ---------- 快捷键 ---------- */
.sc-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0;
  font-size: 12.5px; color: var(--ink-2);
}
.sc-row + .sc-row { border-top: 1px dashed var(--line); }
.sc-row kbd {
  font-family: inherit; font-size: 11px;
  background: var(--tint); color: var(--ink-2);
  border: 1px solid var(--line-strong);
  border-radius: 5px; padding: 0 6px;
  line-height: 18px;
}
.sc-t { color: var(--ink-3); margin-left: 2px; }

/* ---------- 主题选择器 ---------- */
.th-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.th {
  position: relative;
  display: flex; flex-direction: column;
  padding: 9px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--card);
  cursor: pointer;
  text-align: left;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease, transform .16s ease;
}
.th:hover { transform: translateY(-1px); box-shadow: var(--shadow-1); border-color: var(--grass); }
.th.on {
  border-color: var(--leaf);
  background: color-mix(in srgb, var(--grass) 7%, var(--card));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grass) 18%, transparent);
}
.th-prev {
  display: flex; gap: 5px;
  height: 66px;
  padding: 6px;
  border-radius: 8px;
  background: var(--paper);
  border: 1px solid var(--line);
  overflow: hidden;
}
.p-side { width: 15px; border-radius: 4px; background: linear-gradient(178deg, var(--side-a), var(--side-b)); flex: none; }
.p-main { flex: 1; min-width: 0; display: flex; align-items: center; }
.p-card {
  flex: 1; min-width: 0;
  background: var(--card);
  border-radius: 5px;
  padding: 6px 7px;
  display: flex; flex-direction: column; gap: 4px;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 12%, transparent);
}
.p-h { display: block; width: 30px; height: 4px; border-radius: 2px; background: var(--deep); }
.p-l { display: block; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 16%, transparent); }
.p-l.s { width: 62%; }
.p-row { display: flex; align-items: center; gap: 5px; margin-top: 1px; }
.p-chip {
  display: block; width: 24px; height: 8px; border-radius: 99px;
  background: color-mix(in srgb, var(--hl) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--grass) 35%, transparent);
}
.p-btn { display: block; width: 22px; height: 8px; border-radius: 99px; background: var(--deep); }
.p-bar { display: block; height: 3px; border-radius: 99px; background: var(--tint); overflow: hidden; }
.p-bar > i { display: block; height: 100%; width: 62%; border-radius: 99px; background: linear-gradient(90deg, var(--grass), var(--leaf)); }

.th-bar { display: flex; height: 7px; border-radius: 4px; overflow: hidden; margin-top: 9px; }
.th-bar > i { flex: 1; }
.th-meta { display: flex; flex-direction: column; margin-top: 8px; }
.th-name { font-size: 13px; font-weight: 650; color: var(--ink); }
.th-desc { font-size: 11px; color: var(--ink-3); }
.th-tick {
  position: absolute; top: 7px; right: 7px;
  width: 17px; height: 17px; border-radius: 50%;
  background: var(--deep); color: var(--on-deep);
  font-size: 10px; line-height: 17px; text-align: center;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ink) 22%, transparent);
}

</style>
