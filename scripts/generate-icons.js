/**
 * One-off PWA icon generator: renders SVG to PNG via sharp.
 * Run: node scripts/generate-icons.js
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicIcons = join(__dirname, '..', 'public', 'icons')

/** Dark navy, warm white “RM”, rounded square — matches app family tone */
function svgForSize(size) {
  const pad = Math.round(size * 0.12)
  const rx = Math.round(size * 0.2)
  const fontSize = Math.round(size * 0.36)
  const y = Math.round(size * 0.62)
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e36"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="${rx}" fill="url(#g)"/>
  <text x="50%" y="${y}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="${fontSize}" font-weight="800" fill="#f5f3ff" text-anchor="middle" letter-spacing="-0.04em">RM</text>
</svg>`
}

async function main() {
  await mkdir(publicIcons, { recursive: true })

  const targets = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'apple-touch-icon.png', size: 180 },
  ]

  for (const { file, size } of targets) {
    const buf = Buffer.from(svgForSize(size), 'utf8')
    const outPath = join(publicIcons, file)
    await sharp(buf).png({ compressionLevel: 9 }).toFile(outPath)
    console.log('Wrote', outPath)
  }

  await writeFile(
    join(publicIcons, 'icon-source.svg'),
    svgForSize(512),
    'utf8',
  )
  console.log('Wrote', join(publicIcons, 'icon-source.svg'), '(reference SVG)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
