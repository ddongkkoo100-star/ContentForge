// 파이프라인 상태 머신 + workspace/<project>/state.json 영속화.
// INTAKE → OUTLINE → DRAFT → IMAGES → PREVIEW → APPROVED → EXPORTED
// 각 단계는 사람이 확인 후 진행하며, OUTLINE/DRAFT는 재생성이 가능하다.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const STAGES = ["INTAKE", "OUTLINE", "DRAFT", "IMAGES", "PREVIEW", "APPROVED", "EXPORTED"];

export function stageIndex(stage) {
  const i = STAGES.indexOf(stage);
  if (i === -1) throw new Error(`알 수 없는 단계: ${stage}`);
  return i;
}

/**
 * 전이 규칙: 앞으로는 한 단계씩만, 뒤로는 자유(재생성/수정).
 * 승인(APPROVED)은 PREVIEW에서만, EXPORTED는 APPROVED에서만 진입한다.
 */
export function canTransition(from, to) {
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  if (to === "APPROVED") return from === "PREVIEW";
  if (to === "EXPORTED") return from === "APPROVED";
  if (ti <= fi) return true; // 뒤로 이동(재작업) 허용
  return ti === fi + 1; // 앞으로는 한 단계씩
}

function slugify(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "project"}-${randomBytes(3).toString("hex")}`;
}

export class ProjectStore {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
    mkdirSync(workspaceDir, { recursive: true });
  }

  dirOf(id) {
    if (!/^[a-z0-9가-힣-]+$/.test(id)) throw new Error(`잘못된 프로젝트 id: ${id}`);
    return join(this.workspaceDir, id);
  }

  create({ name, mode = "blog", style = "info", topic = "" }) {
    const id = slugify(name || topic || "project");
    const dir = this.dirOf(id);
    mkdirSync(join(dir, "materials"), { recursive: true });
    mkdirSync(join(dir, "images"), { recursive: true });
    const now = new Date().toISOString();
    const state = {
      id,
      name: name || topic || id,
      mode, // "blog" | "insta"
      style,
      topic,
      stage: "INTAKE",
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      exportedAt: null,
      materials: [],
      summary: null,
      outline: { current: null, history: [] },
      draft: { current: null, history: [], rawText: null },
      images: [],
    };
    this.save(state);
    return state;
  }

  load(id) {
    const path = join(this.dirOf(id), "state.json");
    if (!existsSync(path)) throw new Error(`프로젝트를 찾을 수 없습니다: ${id}`);
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  save(state) {
    state.updatedAt = new Date().toISOString();
    const dir = this.dirOf(state.id);
    mkdirSync(dir, { recursive: true });
    // 원자적 쓰기 — 중간 크래시로 state.json이 깨지는 것을 방지
    const tmp = join(dir, `.state.json.tmp`);
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, join(dir, "state.json"));
    return state;
  }

  list() {
    if (!existsSync(this.workspaceDir)) return [];
    return readdirSync(this.workspaceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(this.workspaceDir, d.name, "state.json")))
      .map((d) => this.load(d.name))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  transition(state, to) {
    if (!canTransition(state.stage, to)) {
      throw new Error(`단계 전이 불가: ${state.stage} → ${to}`);
    }
    state.stage = to;
    if (to === "APPROVED") state.approvedAt = new Date().toISOString();
    if (to === "EXPORTED") state.exportedAt = new Date().toISOString();
    return this.save(state);
  }

  /** 재생성 시 이전 버전을 history에 보관 (UI diff용) */
  setVersioned(state, key, value, rawText = null) {
    const slot = state[key];
    if (slot.current) slot.history.push({ ...slot.current, _archivedAt: new Date().toISOString() });
    slot.current = value;
    if (key === "draft") slot.rawText = rawText;
    return this.save(state);
  }
}
