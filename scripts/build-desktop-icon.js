const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const SOURCE_SVG = path.resolve(__dirname, '..', 'frontend', 'public', 'Logo.svg');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'electron', 'assets');
const PNG_ICON_PATH = path.join(OUTPUT_DIR, 'icon.png');
const ICO_ICON_PATH = path.join(OUTPUT_DIR, 'icon.ico');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const build = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await sharp(SOURCE_SVG)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(PNG_ICON_PATH);

  const pngVariants = [];

  for (const size of ICO_SIZES) {
    const variantPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE_SVG)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(variantPath);
    pngVariants.push(variantPath);
  }

  const icoBuffer = await pngToIco(pngVariants);
  await fs.writeFile(ICO_ICON_PATH, icoBuffer);

  await Promise.all(pngVariants.map((filePath) => fs.unlink(filePath)));

  console.log(`Desktop icons created: ${PNG_ICON_PATH}, ${ICO_ICON_PATH}`);
};

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
