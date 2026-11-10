#!/usr/bin/env node
// Rigenera i PNG delle icone dai sorgenti SVG in assets/:
//   icon.svg -> icon.png (1024 px) · tray.svg -> trayTemplate.png (18 px) e trayTemplate@2x.png (36 px)
//   node scripts/build-icons.cjs
// Serve Playwright con Chromium, come per scripts/model/build.cjs.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const assets = path.resolve(__dirname, "../assets");
const targets = [
  ["icon.svg", "icon.png", 1024],
  ["tray.svg", "trayTemplate.png", 18],
  ["tray.svg", "trayTemplate@2x.png", 36]
];

(async () => {
  const browser = await chromium.launch();
  for (const [source, output, size] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = fs.readFileSync(path.join(assets, source), "utf8").replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: path.join(assets, output), omitBackground: true });
    await page.close();
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
