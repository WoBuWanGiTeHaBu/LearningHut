<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; size?: number }>()

const ICONS: Record<string, any> = {
  home: { paths: ['M3 11 L12 3.5 L21 11', 'M5.5 9.5 V20 H18.5 V9.5'] },
  pen: { paths: ['M12 20.5 H21', 'M16.5 3.5 L20.5 7.5 L7.5 20.5 H3.5 V16.5 Z'] },
  target: { paths: ['M12 3 a9 9 0 1 0 .01 0', 'M12 7.5 a4.5 4.5 0 1 0 .01 0', 'M12 10.8 a1.2 1.2 0 1 0 .01 0'] },
  route: { paths: ['M4 19 C 9 19 7 5 12 5 C 17 5 15 19 20 19', 'M3 19 h2', 'M19 19 h2'] },
  book: { paths: ['M4 5 a2 2 0 0 1 2 -2 H20 V19 H6 a2 2 0 0 0 -2 2 Z', 'M4 19 a2 2 0 0 1 2 -2 H20'] },
  bottle: { paths: ['M10 2.5 H14', 'M11 2.5 V6 C 8.5 7.5 7 9.5 7 12.5 V19.5 a2 2 0 0 0 2 2 H15 a2 2 0 0 0 2 -2 V12.5 C 17 9.5 15.5 7.5 13 6 V2.5'] },
  sprout: { paths: ['M12 21.5 V13', 'M12 13 C 12 8.5 8.5 6.5 4 6.5 C 4 11.5 7.5 13 12 13 Z', 'M12 10.5 C 12 6.5 15 4.5 20 4.5 C 20 9 17 10.5 12 10.5'] },
  mail: { paths: ['M4 5 H20 a1.5 1.5 0 0 1 1.5 1.5 V17.5 A1.5 1.5 0 0 1 20 19 H4 A1.5 1.5 0 0 1 2.5 17.5 V6.5 A1.5 1.5 0 0 1 4 5 Z', 'M3 7 L12 13.5 L21 7'] },
  drawer: { paths: ['M4 4 H20 A1.5 1.5 0 0 1 21.5 5.5 V18.5 A1.5 1.5 0 0 1 20 20 H4 A1.5 1.5 0 0 1 2.5 18.5 V5.5 A1.5 1.5 0 0 1 4 5 Z', 'M2.5 13 H8 L10 15.5 H14 L16 13 H21.5'] },
  gear: { paths: ['M4 7.5 H13.8', 'M18.6 7.5 H20', 'M4 12 H5.8', 'M10.4 12 H20', 'M4 16.5 H15.8', 'M20.2 16.5 H20.3'], circles: [[16.2, 7.5, 2.1], [8, 12, 2.1], [18, 16.5, 2.1]] },
  search: { paths: ['M20.5 20.5 L16 16', 'M10.5 3.5 a7 7 0 1 0 .01 0'] },
  play: { paths: ['M8 5.5 L18.5 12 L8 18.5 Z'], fill: [true] },
  pause: { paths: ['M7.5 5 H10.5 V19 H7.5 Z', 'M13.5 5 H16.5 V19 H13.5 Z'], fill: [true, true] },
  next: { paths: ['M6 5.5 L14 12 L6 18.5 Z', 'M16.5 5 V19'], fill: [true, false] },
  prev: { paths: ['M18 5.5 L10 12 L18 18.5 Z', 'M7.5 5 V19'], fill: [true, false] },
  plus: { paths: ['M12 5 V19', 'M5 12 H19'] },
  close: { paths: ['M6 6 L18 18', 'M18 6 L6 18'] },
  trash: { paths: ['M4 7 H20', 'M9.5 7 V4.5 H14.5 V7', 'M6.5 7 L7.5 20 H16.5 L17.5 7'] },
  edit: { paths: ['M4 20 H20', 'M13.5 4 L20 10.5 L10 20.5 H4 V14.5 Z', 'M11 6.5 L17.5 13'] },
  folder: { paths: ['M3 6.5 A2 2 0 0 1 5 4.5 H9 L11 6.5 H19 A2 2 0 0 1 21 8.5 V17.5 A2 2 0 0 1 19 19.5 H5 A2 2 0 0 1 3 17.5 Z'] },
  calendar: { paths: ['M4 5 H20 A1.5 1.5 0 0 1 21.5 6.5 V19.5 A1.5 1.5 0 0 1 20 21 H4 A1.5 1.5 0 0 1 2.5 19.5 V6.5 A1.5 1.5 0 0 1 4 5 Z', 'M2.5 10 H21.5', 'M8 3 V6.5', 'M16 3 V6.5'] },
  external: { paths: ['M14 4.5 H19.5 V10', 'M19.5 4.5 L11 13', 'M9.5 5.5 H6 A2 2 0 0 0 4 7.5 V18 A2 2 0 0 0 6 20 H16.5 A2 2 0 0 0 18.5 18 V14.5'] },
  leaf: { paths: ['M5 19 C 5 10 10 5 20 4 C 19.5 14 14 19.5 6.5 19.5', 'M5 19 C 8 14 11 11 15 8.5'] },
  note: { paths: ['M6 3.5 H18 A2 2 0 0 1 20 5.5 V13.5 L13.5 20 H6 A2 2 0 0 1 4 18 V5.5 A2 2 0 0 1 6 3.5 Z', 'M13.5 20 V13.5 H20'] },
  alert: { paths: ['M12 7.8 V13.4', 'M12 16.6 V16.8'], circles: [[12, 12, 8.6]] },
  info: { paths: ['M12 11.2 V16.6', 'M12 7.4 V7.6'], circles: [[12, 12, 8.6]] },
  check: { paths: ['M5.5 12.6 L10 17 L18.5 7.2'] },
  // 关联 / 取消关联（资料与目标、路线之间）
  link: { paths: ['M10 13.4 a4.7 4.7 0 0 0 7.1 .5 l2.3 -2.3 a4.7 4.7 0 0 0 -6.6 -6.6 l-1.3 1.3', 'M14 10.6 a4.7 4.7 0 0 0 -7.1 -.5 l-2.3 2.3 a4.7 4.7 0 0 0 6.6 6.6 l1.3 -1.3'] },
  unlink: { paths: ['M9.4 14.6 L14.6 9.4', 'M7.4 12.6 L6 14 A3.3 3.3 0 0 0 10.7 18.7 L12.1 17.3', 'M16.6 11.4 L18 10 A3.3 3.3 0 0 0 13.3 5.3 L11.9 6.7'] },
  // 窗控三件套（对齐系统标题栏的细线感：字形占满 24 网格的 5~19）
  min: { paths: ['M5 12 H19'] },
  max: { paths: ['M5.5 5.5 H18.5 V18.5 H5.5 Z'] },
  restore: { paths: ['M8 8 V5.5 H18.5 V16 H16', 'M5.5 8 H16 V18.5 H5.5 Z'] }
}

const icon = computed(() => ICONS[props.name] || ICONS.leaf)
</script>

<template>
  <svg :width="size || 17" :height="size || 17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path v-for="(d, i) in icon.paths" :key="i" :d="d"
      :fill="icon.fill && icon.fill[i] ? 'currentColor' : 'none'"
      :stroke="icon.fill && icon.fill[i] ? 'none' : 'currentColor'" />
    <circle v-for="(c, i) in icon.circles || []" :key="'c' + i"
      :cx="c[0]" :cy="c[1]" :r="c[2]" fill="none" />
  </svg>
</template>
