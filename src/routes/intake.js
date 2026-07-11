// 조사자료 업로드 — 브라우저에서 base64 JSON으로 전송받아 workspace에 저장.
// (multer 의존 없이 express.json만으로 처리)
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const TEXT_EXTS = new Set(["md", "txt", "markdown", "text"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function classify(filename) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTS.has(ext)) return "text";
  if (IMAGE_EXTS.has(ext)) return "image";
  return null;
}

export function registerIntakeRoutes(app, ctx) {
  app.post("/api/intake", wrap((req, res) => {
    const { projectId, files } = req.body ?? {};
    if (!projectId || !Array.isArray(files) || files.length === 0) {
      throw Object.assign(new Error("projectId와 files 배열이 필요합니다"), { status: 400 });
    }
    const state = ctx.store.load(projectId);
    const dir = join(ctx.store.dirOf(projectId), "materials");
    const saved = [];
    for (const f of files) {
      const name = basename(String(f.name ?? "")); // 경로 조작 방지
      const type = classify(name);
      if (!type) {
        throw Object.assign(new Error(`지원하지 않는 파일 형식: ${name} (md/txt/이미지만)`), { status: 400 });
      }
      let buf;
      if (typeof f.text === "string") buf = Buffer.from(f.text, "utf-8");
      else if (typeof f.contentBase64 === "string") buf = Buffer.from(f.contentBase64, "base64");
      else throw Object.assign(new Error(`${name}: text 또는 contentBase64가 필요합니다`), { status: 400 });
      writeFileSync(join(dir, name), buf);
      // 같은 이름 재업로드는 교체로 처리
      state.materials = state.materials.filter((m) => m.filename !== name);
      const entry = { filename: name, type, bytes: buf.length, uploadedAt: new Date().toISOString() };
      state.materials.push(entry);
      saved.push(entry);
    }
    state.summary = null; // 자료가 바뀌면 요약 캐시 무효화
    ctx.store.save(state);
    res.json({ project: state, saved });
  }));
}
