# 把 tools/icon-src.html 渲染出的各尺寸 PNG 组装成 Windows 图标（ICO）。
#
# 流程分两步：
#   1. node tools/shoot-icon.cjs   —— 用无头浏览器把 SVG 矢量渲染成 build/icon-src/icon-<size>.png
#   2. python tools/make-icon.py   —— 组装成 build/icon.ico（本脚本）
#
# 之所以不在这里手绘像素：矢量画形状（书、叶、渐变、投影）可控得多，
# 早先逐像素手算的版本怎么调都像立方体。
import struct
import os

SIZES = [16, 24, 32, 48, 64, 128, 256]

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'build', 'icon-src')
OUT = os.path.join(HERE, '..', 'build')

missing = [s for s in SIZES if not os.path.exists(os.path.join(SRC, f'icon-{s}.png'))]
if missing:
    raise SystemExit(
        '缺少这些尺寸的 PNG: %s\n请先运行： node tools/shoot-icon.cjs' % missing
    )

blobs = []
for s in SIZES:
    with open(os.path.join(SRC, f'icon-{s}.png'), 'rb') as f:
        blobs.append((s, f.read()))

# ---- 组装 ICO（条目用 PNG 压缩格式，Vista 及以上都认）----
count = len(blobs)
header = struct.pack('<HHH', 0, 1, count)
entries = b''
offset = 6 + 16 * count
payload = b''
for s, data in blobs:
    dim = 0 if s >= 256 else s          # 256 在 ICO 里用 0 表示
    entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
    payload += data

ico_path = os.path.join(OUT, 'icon.ico')
with open(ico_path, 'wb') as f:
    f.write(header + entries + payload)
print('WROTE', ico_path, os.path.getsize(ico_path), 'bytes')

# 顺带更新一张 512 的 PNG（README / 安装程序用）
big = os.path.join(SRC, 'icon-512.png')
if os.path.exists(big):
    with open(big, 'rb') as f:
        data = f.read()
    with open(os.path.join(OUT, 'icon.png'), 'wb') as f:
        f.write(data)
    print('WROTE', os.path.join(OUT, 'icon.png'), len(data), 'bytes')
