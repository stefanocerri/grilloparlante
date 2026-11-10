#!/usr/bin/env node
// Rigenera frontend/src/assets/grillo.glb a partire da scene.js.
//   node scripts/model/build.cjs [--preview <cartella>]
// Serve Playwright con Chromium (non è una dipendenza del progetto: `npx playwright install chromium`).
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");

const out = path.resolve(__dirname, "../../frontend/src/assets/grillo.glb");
const previewAt = process.argv.indexOf("--preview");
const previewDir = previewAt > 0 ? path.resolve(process.argv[previewAt + 1]) : null;

(async () => {
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, "scene.js")],
    bundle: true,
    format: "iife",
    globalName: "GrilloScene",
    write: false
  });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("console", (message) => console.log("[pagina]", message.text()));
  await page.setContent("<!doctype html><body style='margin:0'></body>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const base64 = await page.evaluate(() => GrilloScene.exportGlb());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(base64, "base64"));
  console.log(`${path.relative(process.cwd(), out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);

  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    const views = { fronte: 0, trequarti: -0.6, fianco: Math.PI / 2, retro: Math.PI + 0.5 };
    for (const [name, angle] of Object.entries(views)) {
      const url = await page.evaluate(([data, a]) => GrilloScene.preview(data, a), [base64, angle]);
      fs.writeFileSync(path.join(previewDir, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
