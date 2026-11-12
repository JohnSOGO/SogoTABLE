// Game picture batch runner (docs/PICTURES.md). Runs on SogoAI only (the model manager is loopback):
//   node scripts/pictures/run.mjs scripts/pictures/jobs-<games>.mjs C:\Users\Public\sogotable-art\<batch>
// POSTs each job to 127.0.0.1:8793/generate (maintenance priority, waits on 409), keeps the PNG master in
// <out>/<game>/masters and writes the WebP next to it with ComfyUI's Pillow. Resumable: made files are skipped.
// The picked WebPs are then renamed to their slot file and committed; masters stay out of git.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const jobs = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
const OUT = process.argv[3] || "C:\\Users\\Public\\sogotable-art\\out";
const PY = "C:\\AI\\ComfyUI\\venv\\Scripts\\python.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

for (const j of jobs) {
  const base = `${j.slot.replace(/[:]/g, "-").replace(/_/g, "-")}-s${j.seed}`;
  const dir = path.join(OUT, j.game);
  fs.mkdirSync(path.join(dir, "masters"), { recursive: true });
  const png = path.join(dir, "masters", base + ".png");
  const webp = path.join(dir, base + ".webp");
  if (!fs.existsSync(png)) {
    const tall = j.h > j.w;
    const body = { owner: "sogotable", priority: "maintenance", model: "qwen-image21", prompt: j.prompt,
      width: tall ? 896 : 1024, height: tall ? 1248 : 1024, seed: j.seed, ...(j.negative ? { negative: j.negative } : {}) };
    for (let attempt = 1; ; attempt++) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20 * 60 * 1000);
      try {
        const res = await fetch("http://127.0.0.1:8793/generate?format=png", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        if (res.status === 409) { console.log(`409 busy on ${base}, waiting 5 min`); await sleep(300000); continue; }
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        fs.writeFileSync(png, Buffer.from(await res.arrayBuffer()));
        break;
      } catch (e) {
        console.log(`error on ${base} (try ${attempt}): ${e.message}`);
        if (attempt >= 4) throw e;
        await sleep(60000);
      } finally { clearTimeout(t); }
    }
  }
  if (!fs.existsSync(webp)) {
    const q = j.w >= 1024 ? 75 : 78;
    execFileSync(PY, ["-c", `from PIL import Image; Image.open(r'${png}').convert('RGB').resize((${j.w},${j.h}), Image.LANCZOS).save(r'${webp}', quality=${q}, method=6)`]);
  }
  const kb = Math.round(fs.statSync(webp).size / 1024);
  console.log(`ok ${j.game}/${base}.webp ${kb} KB`);
  log.push({ ...j, file: `${j.game}/${base}.webp`, kb });
  fs.writeFileSync(path.join(OUT, "log.json"), JSON.stringify(log, null, 1));
}
console.log(`DONE ${log.length} files`);
