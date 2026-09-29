// NMAO video overlay worker.
// POST /render { input_url, out_path, name?, place?, event?, school? }  (x-overlay-secret header)
//   downloads input_url -> ffmpeg burns NMAO gold border + a lower-third
//   (name · place/event · school) + NMAO wordmark -> uploads MP4 to the
//   Supabase social-media bucket -> returns { ok, url }.
// Sits behind Caddy at postiz.nmao.us/nmao-overlay/* (prefix stripped -> /render).
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.OVERLAY_SECRET || "";
const SUPA_URL = (process.env.SUPA_URL || "").replace(/\/+$/, "");
const SUPA_KEY = process.env.SUPA_SERVICE_KEY || "";
const BUCKET = process.env.OVERLAY_BUCKET || "social-media";
const FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

const clean = (s) => String(s || "").replace(/[\r\n]+/g, " ").slice(0, 80).trim();

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(cmd + " exited " + code + ": " + err.slice(-800)))));
    p.on("error", rej);
  });
}

async function render(body) {
  const { input_url, out_path, name = "", place = "", event = "", school = "" } = body || {};
  if (!input_url || !out_path) throw new Error("input_url and out_path required");
  if (!SUPA_URL || !SUPA_KEY) throw new Error("SUPA_URL / SUPA_SERVICE_KEY not set");
  const dir = await mkdtemp(join(tmpdir(), "ov-"));
  const inF = join(dir, "in.mp4"), outF = join(dir, "out.mp4");
  try {
    const r = await fetch(input_url);
    if (!r.ok) throw new Error("download failed " + r.status);
    await writeFile(inF, Buffer.from(await r.arrayBuffer()));

    const l1 = clean(name);
    const l2 = clean([place, event].filter(Boolean).join("  ·  "));
    const l3 = clean(school);
    await writeFile(join(dir, "l1.txt"), l1);
    await writeFile(join(dir, "l2.txt"), l2);
    await writeFile(join(dir, "l3.txt"), l3);
    await writeFile(join(dir, "wm.txt"), "NATIONAL MARTIAL ARTS ORGANIZATION");

    const gold = "0xC9A84C";
    const vf = [
      "scale=1080:1920:force_original_aspect_ratio=decrease",
      "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
      `drawbox=x=0:y=0:w=iw:h=ih:color=${gold}@1:t=10`,
      "drawbox=x=0:y=1500:w=iw:h=300:color=black@0.55:t=fill",
      `drawtext=fontfile=${FONT_R}:textfile=${join(dir, "wm.txt")}:fontcolor=white@0.85:fontsize=30:x=60:y=70`,
      l1 ? `drawtext=fontfile=${FONT_B}:textfile=${join(dir, "l1.txt")}:fontcolor=white:fontsize=64:x=60:y=1552` : null,
      l2 ? `drawtext=fontfile=${FONT_B}:textfile=${join(dir, "l2.txt")}:fontcolor=${gold}:fontsize=44:x=60:y=1638` : null,
      l3 ? `drawtext=fontfile=${FONT_R}:textfile=${join(dir, "l3.txt")}:fontcolor=white:fontsize=40:x=60:y=1702` : null,
    ].filter(Boolean).join(",");

    await run("ffmpeg", [
      "-y", "-i", inF, "-vf", vf,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outF,
    ]);

    const buf = await readFile(outF);
    const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${out_path}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + SUPA_KEY, "Content-Type": "video/mp4", "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) throw new Error("upload failed " + up.status + " " + (await up.text()).slice(0, 300));
    return { ok: true, url: `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${out_path}`, bytes: buf.length };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && req.url.endsWith("/health")) return send(200, { ok: true });
  if (req.method !== "POST" || !req.url.endsWith("/render")) return send(404, { ok: false, error: "not found" });
  if (!SECRET || req.headers["x-overlay-secret"] !== SECRET) return send(401, { ok: false, error: "unauthorized" });
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on("end", async () => {
    try { send(200, await render(JSON.parse(raw || "{}"))); }
    catch (e) { send(500, { ok: false, error: String(e?.message || e) }); }
  });
});
server.listen(PORT, () => console.log("overlay listening on " + PORT));
