const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createIcon() {
  const input = 'build/icon.svg';
  const outputDir = 'build/icon.iconset';
  
  // Create iconset directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // macOS icon sizes
  const sizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];
  
  console.log('Creating icon files...');
  for (const { name, size } of sizes) {
    await sharp(input)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, name));
    console.log(`Created ${name}`);
  }
  
  console.log('Icon creation complete!');
  console.log('Run: iconutil -c icns build/icon.iconset -o build/icon.icns');
}

createIcon().catch(console.error);

