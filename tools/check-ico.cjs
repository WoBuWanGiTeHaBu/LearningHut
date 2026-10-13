/* 解析 build/icon.ico，确认里面到底塞了哪几档尺寸、每档能不能当 PNG 解出来。
   （make-icon.py 是「写」，这里是「读回来核」，两边独立） */
const fs = require('node:fs')
const path = require('node:path')

const ico = path.join(__dirname, '..', 'build', 'icon.ico')
const buf = fs.readFileSync(ico)

const reserved = buf.readUInt16LE(0)
const type = buf.readUInt16LE(2)
const count = buf.readUInt16LE(4)

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const entries = []
const seen = new Set()
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16
  const w = buf.readUInt8(o) === 0 ? 256 : buf.readUInt8(o)
  const h = buf.readUInt8(o + 1) === 0 ? 256 : buf.readUInt8(o + 1)
  const bpp = buf.readUInt16LE(o + 6)
  const bytes = buf.readUInt32LE(o + 8)
  const offset = buf.readUInt32LE(o + 12)
  const data = buf.subarray(offset, offset + bytes)
  const isPng = data.subarray(0, 8).equals(PNG_SIG)
  // 从 PNG 的 IHDR 里读真实宽高，防止「清单写的 48、图其实是 32」这种错配
  let realW = null, realH = null
  if (isPng) { realW = data.readUInt32BE(16); realH = data.readUInt32BE(20) }
  if (seen.has(w)) entries.push({ size: w, DUP: true })
  seen.add(w)
  entries.push({
    declared: `${w}x${h}`, bpp, bytes, offset,
    png: isPng, real: isPng ? `${realW}x${realH}` : null,
    match: isPng && realW === w && realH === h
  })
}

const sizes = entries.filter(e => e.declared).map(e => e.declared)
const allGood = entries.every(e => e.png && e.match)

console.log(JSON.stringify({
  file: ico,
  fileBytes: buf.length,
  reserved, type, count,
  sizes,
  allPng: entries.every(e => e.png),
  allSizesMatch: allGood,
  entries
}, null, 2))
