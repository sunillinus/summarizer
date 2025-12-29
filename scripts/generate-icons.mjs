import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const publicDir = join(__dirname, '..', 'public')

const sizes = [16, 48, 128]

for (const size of sizes) {
  await sharp(join(publicDir, `icon${size}.svg`))
    .png()
    .toFile(join(publicDir, `icon${size}.png`))
  console.log(`Created icon${size}.png`)
}

console.log('Done!')
