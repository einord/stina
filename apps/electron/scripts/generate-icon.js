const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const iconsDir = path.join(__dirname, "..", "resources", "icons");
const iconsetDir = path.join(iconsDir, "icon.iconset");

const mappings = [
  ["16x16.png", "icon_16x16.png"],
  ["32x32.png", "icon_16x16@2x.png"],
  ["32x32.png", "icon_32x32.png"],
  ["64x64.png", "icon_32x32@2x.png"],
  ["128x128.png", "icon_128x128.png"],
  ["256x256.png", "icon_128x128@2x.png"],
  ["256x256.png", "icon_256x256.png"],
  ["512x512.png", "icon_256x256@2x.png"],
  ["512x512.png", "icon_512x512.png"],
];

fs.mkdirSync(iconsetDir, { recursive: true });

for (const [src, dest] of mappings) {
  const srcPath = path.join(iconsDir, src);
  if (!fs.existsSync(srcPath)) {
    console.error(`Missing source icon: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(srcPath, path.join(iconsetDir, dest));
}

execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(iconsDir, "icon.icns")}"`, {
  stdio: "inherit",
});

fs.rmSync(iconsetDir, { recursive: true });

console.log("Generated resources/icons/icon.icns");
