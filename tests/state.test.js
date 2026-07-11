import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore, canTransition, STAGES } from "../src/pipeline/state.js";

function makeStore() {
  return new ProjectStore(mkdtempSync(join(tmpdir(), "cf-ws-")));
}

test("전이 규칙: 앞으로 한 칸, 뒤로 자유, 승인/출력은 게이트", () => {
  assert.equal(canTransition("INTAKE", "OUTLINE"), true);
  assert.equal(canTransition("INTAKE", "DRAFT"), false); // 건너뛰기 금지
  assert.equal(canTransition("DRAFT", "OUTLINE"), true); // 재작업 뒤로 이동
  assert.equal(canTransition("PREVIEW", "APPROVED"), true);
  assert.equal(canTransition("IMAGES", "APPROVED"), false); // 승인은 PREVIEW에서만
  assert.equal(canTransition("APPROVED", "EXPORTED"), true);
  assert.equal(canTransition("PREVIEW", "EXPORTED"), false); // 승인 없이 출력 불가
});

test("state.json 영속화 라운드트립", () => {
  const store = makeStore();
  const state = store.create({ name: "테스트 프로젝트", mode: "blog", style: "info", topic: "주제" });
  assert.equal(state.stage, "INTAKE");
  const loaded = store.load(state.id);
  assert.equal(loaded.name, "테스트 프로젝트");
  assert.deepEqual(Object.keys(loaded.outline), ["current", "history"]);
});

test("transition은 잘못된 전이를 거부하고 승인 시각을 찍는다", () => {
  const store = makeStore();
  const state = store.create({ name: "t" });
  assert.throws(() => store.transition(state, "APPROVED"), /단계 전이 불가/);
  for (const stage of ["OUTLINE", "DRAFT", "IMAGES", "PREVIEW", "APPROVED"]) {
    store.transition(state, stage);
  }
  assert.ok(state.approvedAt);
  store.transition(state, "EXPORTED");
  assert.ok(state.exportedAt);
});

test("setVersioned는 이전 버전을 history에 보관한다 (diff용)", () => {
  const store = makeStore();
  const state = store.create({ name: "t" });
  store.setVersioned(state, "outline", { title: "v1", sections: [] });
  store.setVersioned(state, "outline", { title: "v2", sections: [] });
  const loaded = store.load(state.id);
  assert.equal(loaded.outline.current.title, "v2");
  assert.equal(loaded.outline.history.length, 1);
  assert.equal(loaded.outline.history[0].title, "v1");
});

test("list는 최신 갱신순으로 정렬", async () => {
  const store = makeStore();
  const a = store.create({ name: "a" });
  await new Promise((r) => setTimeout(r, 5));
  store.create({ name: "b" });
  await new Promise((r) => setTimeout(r, 5));
  store.save(store.load(a.id)); // a를 다시 갱신
  const list = store.list();
  assert.equal(list[0].id, a.id);
  assert.equal(list.length, 2);
});

test("STAGES 순서는 스펙과 일치", () => {
  assert.deepEqual(STAGES, ["INTAKE", "OUTLINE", "DRAFT", "IMAGES", "PREVIEW", "APPROVED", "EXPORTED"]);
});
