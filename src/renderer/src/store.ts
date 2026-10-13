// 极简全局状态（不引 Pinia）
import { reactive } from 'vue'
import { api } from './api'
import type { BgmTrack } from '../../shared/types'

export type Domain = 'study' | 'hobby'

function readDomain(): Domain {
  try {
    const v = localStorage.getItem('sh-domain')
    return v === 'hobby' ? 'hobby' : 'study'
  } catch { return 'study' }
}

export const store = reactive({
  searchOpen: false,
  // 学习 / 爱好 全局切换（localStorage 持久化，跟主题一个思路）
  domain: readDomain() as Domain,
  bgm: {
    tracks: [] as BgmTrack[],
    idx: -1,
    playing: false,
    audio: null as HTMLAudioElement | null
  }
})

export function setDomain(d: Domain) {
  store.domain = d
  try { localStorage.setItem('sh-domain', d) } catch { /* 隐私模式忽略 */ }
}

export async function initBgm() {
  try {
    const tracks = await api.bgm.list()
    store.bgm.tracks = tracks
    if (tracks.length) {
      store.bgm.audio = new Audio()
      store.bgm.audio.volume = 0.6
      loadTrack(0)
    }
  } catch (e) {
    console.error('bgm init failed', e)
  }
}

function loadTrack(i: number) {
  const b = store.bgm
  if (!b.tracks.length || !b.audio) return
  b.idx = (i + b.tracks.length) % b.tracks.length
  const p = b.tracks[b.idx].path.replace(/\\/g, '/')
  b.audio.src = 'lh-media://local/' + p.replace(/^\//, '')
}

export function togglePlay() {
  const b = store.bgm
  if (!b.audio || !b.tracks.length) return
  if (b.playing) { b.audio.pause(); b.playing = false }
  else { b.audio.play().then(() => (b.playing = true)).catch(() => (b.playing = false)) }
}

export function nextTrack() {
  const b = store.bgm
  if (!b.audio) return
  loadTrack(b.idx + 1)
  if (b.playing) b.audio.play().catch(() => {})
}

export function prevTrack() {
  const b = store.bgm
  if (!b.audio) return
  loadTrack(b.idx - 1)
  if (b.playing) b.audio.play().catch(() => {})
}

export function setupBgmAudio() {
  const b = store.bgm
  if (!b.audio) return
  b.audio.addEventListener('ended', () => nextTrack())
}
