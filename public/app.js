/* ContentForge 웹 UI — 편집실(Editorial Desk)
   파이프라인 스텝퍼가 UI의 주인공. 모든 상태는 서버 state.json이 진실. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);

const S = {
  projects: [],
  project: null,     // 선택된 프로젝트 state
  presets: {},
  status: null,      // /api/status 응답
  settings: null,
  error: null,       // {message}
  working: null,     // 진행 중 작업 라벨
  expandedStep: null,// 접힌 카드 강제 펼침
  generating: new Set(), // 생성 중 이미지 id
  genStartedAt: 0,
  carouselIndex: 0,
};

/* ── API ─────────────────────────────────────────── */
async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
  return json;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── 상태바 배지 ─────────────────────────────────── */
async function refreshStatus() {
  try {
    const st = await api("GET", "/api/status");
    S.status = st;
    S.settings = st.settings;
  } catch (err) {
    S.status = null;
  }
  renderBadges();
}

function badgeClass(engineName, available) {
  if (engineName === "mock") return "mock";
  return available ? "on" : "off";
}

function renderBadges() {
  const el = $("#badges");
  if (!S.status) {
    el.innerHTML = `<span class="badge off"><span class="dot"></span>server</span>`;
    return;
  }
  const w = S.status.writer;
  const i = S.status.image;
  const oauthOn = i.oauth === "ready";
  const parts = [
    `<span class="badge ${badgeClass(w.engine, w.available)}" title="${esc(w.reason || w.version || "")}">${esc(w.engine)} <span class="dot"></span></span>`,
    `<span class="badge ${badgeClass(i.engine, i.available)}" title="${esc(i.hint || i.detail || "")}">${i.engine === "ima2" ? "ima2" : "img:mock"} <span class="dot"></span></span>`,
  ];
  if (i.engine === "ima2") {
    parts.push(`<span class="badge ${oauthOn ? "on" : "off"}" title="oauth: ${esc(i.oauth ?? "unknown")}">OAuth <span class="dot"></span></span>`);
  }
  el.innerHTML = parts.join("");
}

/* ── 프로젝트 목록 ───────────────────────────────── */
const STEP_LABELS = ["① 자료", "② 개요", "③ 초안", "④ 이미지", "⑤ 승인"];
const STAGE_STEP = { INTAKE: 0, OUTLINE: 1, DRAFT: 2, IMAGES: 3, PREVIEW: 4, APPROVED: 4, EXPORTED: 4 };

async function loadProjects(keepSelection = true) {
  const { projects } = await api("GET", "/api/projects");
  S.projects = projects;
  if (keepSelection && S.project) {
    S.project = projects.find((p) => p.id === S.project.id) ?? null;
  }
  renderSidebar();
}

function renderSidebar() {
  const el = $("#projectList");
  el.innerHTML = S.projects
    .map((p) => `
      <button class="project-item ${S.project?.id === p.id ? "active" : ""}" data-id="${esc(p.id)}">
        ${esc(p.name)}
        <span class="p-meta">${p.mode === "insta" ? "insta" : "blog"} · ${esc(p.stage)}</span>
      </button>`)
    .join("");
  el.querySelectorAll(".project-item").forEach((btn) =>
    btn.addEventListener("click", () => selectProject(btn.dataset.id)),
  );
}

async function selectProject(id) {
  const { project } = await api("GET", `/api/projects/${id}`);
  S.project = project;
  S.error = null;
  S.expandedStep = null;
  S.carouselIndex = 0;
  $("#sidebar").classList.remove("open");
  renderSidebar();
  render();
}

/* ── 공통 액션 래퍼 (에러 스트립) ─────────────────── */
async function act(label, fn) {
  S.working = label;
  S.error = null;
  render();
  try {
    await fn();
  } catch (err) {
    S.error = { message: err.message };
  }
  S.working = null;
  await loadProjects();
  render();
}

/* ── 메인 렌더 ───────────────────────────────────── */
function render() {
  const main = $("#main");
  if (!S.project) {
    main.innerHTML = `
      <div class="empty-state">
        <h3 style="font-family: var(--font-display); font-size: 22px; color: var(--text)">편집실이 비어 있습니다</h3>
        <p style="margin-top: 6px">좌측에서 프로젝트를 고르거나 새 작업을 시작하세요.</p>
        <div class="dropzone" id="emptyDrop">
          <div class="dz-big">조사자료를 끌어다 놓으면 시작합니다</div>
          <div>md / txt / 이미지 — 놓는 순간 새 작업이 만들어집니다</div>
        </div>
      </div>`;
    bindDropzone($("#emptyDrop"), async (files) => {
      const { project } = await api("POST", "/api/projects", { name: files[0]?.name?.replace(/\.\w+$/, "") || "새 작업" });
      S.project = project;
      await uploadFiles(files);
    });
    return;
  }

  const p = S.project;
  const cur = STAGE_STEP[p.stage] ?? 0;
  const parts = [renderStepper(cur, p.stage)];
  if (S.error) {
    parts.push(`
      <div class="error-strip" role="alert">
        <span class="e-label">오류</span>
        ${esc(S.error.message)}
      </div>`);
  }
  // 이전 단계는 접힌 카드로 위에 스택, 현재 단계는 펼친 카드
  for (let step = 0; step <= cur; step++) {
    const expanded = step === cur || S.expandedStep === step;
    parts.push(renderStep(step, expanded, cur));
  }
  main.innerHTML = parts.join("");
  bindStepEvents(cur);
}

function renderStepper(cur, stage) {
  const items = [];
  for (let i = 0; i < STEP_LABELS.length; i++) {
    const cls = i < cur || stage === "EXPORTED" || (i === 4 && (stage === "APPROVED" || stage === "EXPORTED"))
      ? "done" : i === cur ? "current" : "";
    items.push(`
      <div class="step ${cls}">
        <span class="s-dot"></span>
        <span class="s-label">${STEP_LABELS[i]}</span>
      </div>`);
    if (i < STEP_LABELS.length - 1) items.push(`<div class="step-line ${i < cur ? "done" : ""}"></div>`);
  }
  return `<div class="stepper" aria-label="제작 라인">${items.join("")}</div>`;
}

function collapsedCard(step, title, meta) {
  return `
    <div class="card collapsed" data-expand="${step}" role="button" tabindex="0">
      <div class="fold-head">
        <span class="f-title">${title}</span>
        <span class="f-meta">${esc(meta)}</span>
      </div>
    </div>`;
}

function workingNote(label) {
  return S.working === label ? `<span class="working">${esc(label)} 중…</span>` : "";
}

function renderStep(step, expanded, cur) {
  const p = S.project;
  switch (step) {
    case 0: return renderIntake(expanded);
    case 1: return renderOutline(expanded);
    case 2: return renderDraft(expanded);
    case 3: return renderImages(expanded);
    case 4: return renderApprove();
  }
  return "";
}

/* ── ① 자료 ─────────────────────────────────────── */
function renderIntake(expanded) {
  const p = S.project;
  if (!expanded) {
    return collapsedCard(0, "① 자료", `${p.materials.length}개 파일`);
  }
  const files = p.materials
    .map((m) => `<li>${m.type === "image" ? "🖼" : "📄"} ${esc(m.filename)}<span class="f-size">${(m.bytes / 1024).toFixed(1)}KB</span></li>`)
    .join("");
  return `
    <div class="card">
      <h3>① 자료</h3>
      <p class="c-sub">${esc(p.topic || p.name)} · ${p.mode === "insta" ? "인스타그램" : "네이버 블로그"} · ${esc(p.style)}</p>
      <div class="dropzone" id="drop">
        <div class="dz-big">조사자료를 끌어다 놓으면 시작합니다</div>
        <div>md / txt / 이미지 (클릭해서 선택도 가능)</div>
      </div>
      ${files ? `<ul class="file-list">${files}</ul>` : ""}
      <div class="btn-row">
        <span class="spacer"></span>
        ${workingNote("개요 생성")}
        <button class="btn primary" id="btnOutline" ${p.materials.some((m) => m.type === "text") && !S.working ? "" : "disabled"}>개요 생성 →</button>
      </div>
    </div>`;
}

/* ── ② 개요 ─────────────────────────────────────── */
function renderOutline(expanded) {
  const p = S.project;
  const o = p.outline.current;
  if (!expanded) return collapsedCard(1, "② 개요", o ? `${o.sections.length}개 섹션` : "-");
  if (!o) return `<div class="card"><h3>② 개요</h3><p class="c-sub">아직 개요가 없습니다.</p></div>`;
  return `
    <div class="card">
      <h3>② 개요</h3>
      <p class="c-sub">가제: ${esc(o.title)}${p.outline.history.length ? ` · 재생성 ${p.outline.history.length}회` : ""}</p>
      <ol class="outline-list">
        ${o.sections.map((s) => `<li><span class="o-heading">${esc(s.heading)}</span><div class="o-summary">${esc(s.summary)}</div></li>`).join("")}
      </ol>
      <div class="btn-row">
        <button class="btn" id="btnReOutline" ${S.working ? "disabled" : ""}>재생성</button>
        <span class="spacer"></span>
        ${workingNote("개요 재생성")}${workingNote("초안 생성")}
        <button class="btn primary" id="btnDraft" ${S.working ? "disabled" : ""}>초안 생성 →</button>
      </div>
    </div>`;
}

/* ── ③ 초안 (+diff) ─────────────────────────────── */
function renderDraft(expanded) {
  const p = S.project;
  const d = p.draft.current;
  if (!expanded) {
    const len = d ? (d.body_md ?? d.caption ?? "").length : 0;
    return collapsedCard(2, "③ 초안", d ? `${len.toLocaleString()}자` : "-");
  }
  if (!d) return `<div class="card"><h3>③ 초안</h3><p class="c-sub">아직 초안이 없습니다.</p></div>`;
  const text = p.mode === "insta" ? d.caption : d.body_md;
  const prev = p.draft.history.length ? p.draft.history[p.draft.history.length - 1] : null;
  const prevText = prev ? (p.mode === "insta" ? prev.caption : prev.body_md) : null;
  const showDiff = prevText != null && prevText !== text;
  const bodyHtml = showDiff ? diffHtml(prevText, text) : esc(text);
  return `
    <div class="card">
      <h3>③ 초안</h3>
      <p class="c-sub">
        ${p.mode === "insta" ? "캡션 + 슬라이드" : `제목 후보 ${d.titles?.length ?? 0}개 · 태그 ${d.tags?.length ?? 0}개`}
        ${p.draft.history.length ? ` · 재생성 ${p.draft.history.length}회 ${showDiff ? "(변경부 하이라이트)" : ""}` : ""}
        ${d._fallback ? ` · <span style="color: var(--danger)">JSON 파싱 폴백</span>` : ""}
      </p>
      ${p.mode === "blog" && d.titles ? `<div style="margin-bottom:12px">${d.titles.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="draft-body" id="draftView">${bodyHtml}</div>
      <div id="draftEditWrap" hidden>
        <textarea id="draftEdit">${esc(text)}</textarea>
      </div>
      ${p.mode === "blog" && d.tags?.length ? `<div style="margin-top:10px">${d.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="btn-row">
        <button class="btn" id="btnReDraft" ${S.working ? "disabled" : ""}>재생성</button>
        <button class="btn" id="btnEditDraft" ${S.working ? "disabled" : ""}>직접 수정</button>
        <button class="btn primary" id="btnSaveDraft" hidden>수정 저장</button>
        <span class="spacer"></span>
        ${workingNote("초안 재생성")}${workingNote("이미지 생성")}
        <button class="btn primary" id="btnImages" ${S.working || !p.images.length ? "disabled" : ""}>이미지 생성 →</button>
      </div>
    </div>`;
}

/* 단어 단위 diff — 추가=앰버 8% 배경, 삭제=취소선 dim (§3.6) */
function diffHtml(oldText, newText) {
  const a = oldText.split(/(\s+)/);
  const b = newText.split(/(\s+)/);
  if (a.length * b.length > 400_000) return esc(newText); // 대형 텍스트는 diff 생략
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push(esc(a[i])); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`<span class="diff-del">${esc(a[i])}</span>`); i++; }
    else { out.push(`<span class="diff-add">${esc(b[j])}</span>`); j++; }
  }
  while (i < m) out.push(`<span class="diff-del">${esc(a[i++])}</span>`);
  while (j < n) out.push(`<span class="diff-add">${esc(b[j++])}</span>`);
  return out.join("");
}

/* ── ④ 이미지 그리드 ────────────────────────────── */
function renderImages(expanded) {
  const p = S.project;
  if (!expanded) {
    const done = p.images.filter((i) => i.status === "done").length;
    return collapsedCard(3, "④ 이미지", `${done}/${p.images.length} 생성됨`);
  }
  const cells = p.images.map((img) => {
    const generating = S.generating.has(img.id);
    const src = img.file ? `/api/projects/${p.id}/images/${img.file}?v=${esc(img.generatedAt ?? "")}` : null;
    return `
      <div class="img-cell ${generating ? "generating" : ""}" data-imgid="${esc(img.id)}">
        <span class="cell-label">${esc(img.id)} · ${esc(img.role)}${img.status === "stale" ? " · 재생성 필요" : ""}</span>
        ${src && !generating ? `<img src="${src}" alt="${esc(img.prompt)}" />` : ""}
        ${generating ? `<div class="skeleton"><span class="elapsed" data-elapsed>0.0s</span></div>` : ""}
        ${img.status === "error" && !generating ? `<div class="err-note">${esc(img.error ?? "생성 실패")}</div>` : ""}
        ${!generating ? `
          <div class="overlay">
            <button class="btn small" data-regen="${esc(img.id)}">재생성</button>
            <button class="btn small" data-editprompt="${esc(img.id)}">프롬프트 편집</button>
          </div>` : ""}
      </div>`;
  }).join("");
  const allDone = p.images.length > 0 && p.images.every((i) => i.status === "done");
  return `
    <div class="card">
      <h3>④ 이미지</h3>
      <p class="c-sub">${p.mode === "insta" ? "캐러셀 슬라이드" : "본문 삽화"} ${p.images.length}장 — 셀에 올리면 재생성/편집</p>
      <div class="img-grid">${cells}</div>
      <div class="btn-row">
        <button class="btn" id="btnGenAll" ${S.working ? "disabled" : ""}>${allDone ? "전체 재생성" : "전체 생성"}</button>
        <span class="spacer"></span>
        ${workingNote("이미지 생성")}
        <button class="btn primary" id="btnPreview" ${allDone && !S.working ? "" : "disabled"}>미리보기 →</button>
      </div>
    </div>`;
}

/* ── ⑤ 승인 (도장) ──────────────────────────────── */
function renderApprove() {
  const p = S.project;
  const approved = p.stage === "APPROVED" || p.stage === "EXPORTED";
  const stampMark = approved
    ? `<div class="stamp-mark">승인됨 · ${fmtDate(p.approvedAt)}</div>`
    : "";
  const preview = p.mode === "insta" ? renderInstaPreview() : renderBlogPreview();
  return `
    <div class="card">
      ${stampMark}
      <h3>⑤ 승인</h3>
      <p class="c-sub">초안·이미지를 최종 확인하고 도장을 찍으세요. 도장 이후에만 패키지 출력이 열립니다.</p>
      <div class="preview-scroll">${preview}</div>
      <div class="stamp-zone">
        <button class="stamp-btn" id="btnStamp" ${approved || S.working ? "disabled" : ""} aria-label="승인 도장">승인</button>
        <div>
          <div class="mono">${approved ? `승인 완료 — 패키지를 출력할 수 있습니다` : `PREVIEW 상태에서만 승인할 수 있습니다`}</div>
          <div class="btn-row" style="margin-top: 10px">
            <button class="btn primary" id="btnExport" ${approved && !S.working ? "" : "disabled"}>패키지 출력 (Export)</button>
            ${p.stage === "EXPORTED" ? `<span class="mono">출력됨 · ${fmtDate(p.exportedAt)} → output/${esc(p.id)}-${p.mode}</span>` : ""}
            ${workingNote("패키지 출력")}
          </div>
        </div>
      </div>
    </div>`;
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderBlogPreview() {
  const p = S.project;
  const d = p.draft.current;
  if (!d) return "";
  let html = mdPreview(d.body_md);
  for (const img of p.images) {
    if (img.file) {
      html = html.replaceAll(
        `[${img.id}]`,
        `<img src="/api/projects/${p.id}/images/${img.file}" alt="${esc(img.prompt)}" />`,
      );
    }
  }
  return `<div class="preview-blog"><h1>${esc(d.titles?.[0] ?? p.topic)}</h1>${html}</div>`;
}

/* 미리보기용 초간단 마크다운 렌더 (서버 export와 동일한 단순 태그) */
function mdPreview(md) {
  const lines = esc(md).split("\n");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) { close(); const lv = Math.min(Math.max(h[1].length, 2), 3); out.push(`<h${lv}>${h[2]}</h${lv}>`); continue; }
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${ul[1]}</li>`); continue; }
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ol) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${ol[1]}</li>`); continue; }
    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) { close(); out.push(`<blockquote>${bq[1]}</blockquote>`); continue; }
    if (!line.trim()) { close(); continue; }
    close();
    out.push(`<p>${line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`);
  }
  close();
  return out.join("\n");
}

/* 인스타 폰 프레임 + 캐러셀 스와이프 시뮬레이터 (§3.6) */
function renderInstaPreview() {
  const p = S.project;
  const d = p.draft.current;
  if (!d) return "";
  const slides = p.images.map((img, i) => {
    const slideText = d.slides?.[i]?.text ?? "";
    return `
      <div class="slide">
        ${img.file ? `<img src="/api/projects/${p.id}/images/${img.file}" alt="슬라이드 ${i + 1}" />` : ""}
        <div class="s-text">${esc(slideText)}</div>
      </div>`;
  }).join("");
  const dots = p.images.map((_, i) => `<span class="cd ${i === S.carouselIndex ? "on" : ""}"></span>`).join("");
  const allTags = [...(d.hashtags?.popular ?? []), ...(d.hashtags?.mid ?? []), ...(d.hashtags?.niche ?? [])];
  return `
    <div class="phone-frame">
      <div class="ph-top"></div>
      <div class="carousel">
        <div class="track" style="transform: translateX(-${S.carouselIndex * 100}%)">${slides}</div>
      </div>
      <div class="carousel-nav">
        <button class="btn small" id="carPrev" aria-label="이전 슬라이드">‹</button>
        <div class="carousel-dots">${dots}</div>
        <button class="btn small" id="carNext" aria-label="다음 슬라이드">›</button>
      </div>
      <div class="ph-caption">${esc(d.caption)}\n\n<span class="mono">${allTags.slice(0, 12).map((t) => `#${esc(t)}`).join(" ")}${allTags.length > 12 ? " …" : ""}</span></div>
    </div>`;
}

/* ── 이벤트 바인딩 ──────────────────────────────── */
function bindStepEvents(cur) {
  document.querySelectorAll("[data-expand]").forEach((el) => {
    const open = () => { S.expandedStep = S.expandedStep === +el.dataset.expand ? null : +el.dataset.expand; render(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });

  const drop = $("#drop");
  if (drop) bindDropzone(drop, uploadFiles);

  $("#btnOutline")?.addEventListener("click", () =>
    act("개요 생성", async () => { await api("POST", "/api/outline", { projectId: S.project.id }); await reloadProject(); }));
  $("#btnReOutline")?.addEventListener("click", () =>
    act("개요 재생성", async () => { await api("POST", "/api/outline", { projectId: S.project.id }); await reloadProject(); }));
  $("#btnDraft")?.addEventListener("click", () =>
    act("초안 생성", async () => { await api("POST", "/api/draft", { projectId: S.project.id }); await reloadProject(); }));
  $("#btnReDraft")?.addEventListener("click", () =>
    act("초안 재생성", async () => { await api("POST", "/api/draft", { projectId: S.project.id }); await reloadProject(); }));

  $("#btnEditDraft")?.addEventListener("click", () => {
    $("#draftView").hidden = true;
    $("#draftEditWrap").hidden = false;
    $("#btnSaveDraft").hidden = false;
    $("#btnEditDraft").hidden = true;
  });
  $("#btnSaveDraft")?.addEventListener("click", () =>
    act("초안 수정 저장", async () => {
      const text = $("#draftEdit").value;
      const body = S.project.mode === "insta" ? { caption: text } : { body_md: text };
      await api("PATCH", "/api/draft", { projectId: S.project.id, ...body });
      await reloadProject();
    }));

  $("#btnImages")?.addEventListener("click", () => generateImages());
  $("#btnGenAll")?.addEventListener("click", () => generateImages());
  document.querySelectorAll("[data-regen]").forEach((b) =>
    b.addEventListener("click", () => generateImages([b.dataset.regen])));
  document.querySelectorAll("[data-editprompt]").forEach((b) =>
    b.addEventListener("click", () => openPromptDialog(b.dataset.editprompt)));

  $("#btnPreview")?.addEventListener("click", () =>
    act("미리보기 이동", async () => {
      await api("POST", `/api/projects/${S.project.id}/stage`, { to: "PREVIEW" });
      await reloadProject();
    }));

  $("#btnStamp")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.add("stamping");
    setTimeout(() => act("승인", async () => {
      await api("POST", `/api/projects/${S.project.id}/approve`, {});
      await reloadProject();
    }), 300); // 도장 애니메이션(300ms) 후 확정
  });

  $("#btnExport")?.addEventListener("click", () =>
    act("패키지 출력", async () => {
      await api("POST", "/api/export", { projectId: S.project.id });
      await reloadProject();
    }));

  $("#carPrev")?.addEventListener("click", () => { S.carouselIndex = Math.max(0, S.carouselIndex - 1); render(); });
  $("#carNext")?.addEventListener("click", () => { S.carouselIndex = Math.min(S.project.images.length - 1, S.carouselIndex + 1); render(); });
}

async function reloadProject() {
  const { project } = await api("GET", `/api/projects/${S.project.id}`);
  S.project = project;
}

/* ── 파일 업로드 ────────────────────────────────── */
function bindDropzone(el, handler) {
  el.addEventListener("click", () => {
    $("#fileInput").onchange = () => { handler([...$("#fileInput").files]); $("#fileInput").value = ""; };
    $("#fileInput").click();
  });
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("dragover"); });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragover");
    handler([...e.dataTransfer.files]);
  });
}

async function uploadFiles(files) {
  if (!files.length) return;
  await act("자료 업로드", async () => {
    const payload = await Promise.all(files.map(async (f) => ({
      name: f.name,
      contentBase64: await fileToBase64(f),
    })));
    await api("POST", "/api/intake", { projectId: S.project.id, files: payload });
    await reloadProject();
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ── 이미지 생성 (스켈레톤 + 경과 시간) ──────────── */
async function generateImages(ids) {
  const p = S.project;
  const targets = ids ?? p.images.map((i) => i.id);
  targets.forEach((id) => S.generating.add(id));
  S.genStartedAt = performance.now();
  S.working = "이미지 생성";
  S.error = null;
  render();
  const timer = setInterval(() => {
    const sec = ((performance.now() - S.genStartedAt) / 1000).toFixed(1);
    document.querySelectorAll("[data-elapsed]").forEach((el) => (el.textContent = `${sec}s`));
  }, 100);
  try {
    const { results } = await api("POST", "/api/images", { projectId: p.id, ids });
    const failed = results.filter((r) => !r.ok);
    if (failed.length) S.error = { message: failed.map((f) => `${f.id}: ${f.error}`).join(" / ") };
    await reloadProject();
  } catch (err) {
    S.error = { message: err.message };
  }
  clearInterval(timer);
  S.generating.clear();
  S.working = null;
  await loadProjects();
  render();
}

function openPromptDialog(id) {
  const img = S.project.images.find((i) => i.id === id);
  if (!img) return;
  $("#promptLabel").textContent = `${id} 프롬프트`;
  $("#promptText").value = img.prompt;
  const dlg = $("#dlgPrompt");
  dlg.showModal();
  $("#btnPromptCancel").onclick = () => dlg.close();
  $("#btnPromptSave").onclick = async () => {
    dlg.close();
    await act("프롬프트 저장", async () => {
      await api("PATCH", "/api/images", { projectId: S.project.id, id, prompt: $("#promptText").value });
      await reloadProject();
    });
    await generateImages([id]);
  };
}

/* ── 새 작업 / 설정 다이얼로그 ───────────────────── */
async function initDialogs() {
  const { presets } = await api("GET", "/api/presets");
  S.presets = presets;
  $("#npStyle").innerHTML = Object.entries(presets)
    .map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`)
    .join("");

  $("#btnNew").addEventListener("click", () => $("#dlgNew").showModal());
  $("#formNew").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "ok") return;
    const { project } = await api("POST", "/api/projects", {
      name: $("#npName").value.trim(),
      topic: $("#npTopic").value.trim(),
      mode: $("#npMode").value,
      style: $("#npStyle").value,
    });
    await loadProjects(false);
    await selectProject(project.id);
  });

  $("#btnMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  const dlgSet = $("#dlgSettings");
  $("#btnSettings").addEventListener("click", () => {
    $("#setWriter").value = S.settings?.writerEngine ?? "mock";
    $("#setImage").value = S.settings?.imageEngine ?? "mock";
    $("#setProvider").value = S.settings?.imageProvider ?? "oauth";
    dlgSet.showModal();
  });
  $("#btnSettingsClose").addEventListener("click", () => dlgSet.close());
  $("#btnSettingsSave").addEventListener("click", async () => {
    const wantApi = $("#setProvider").value === "api";
    const wasApi = S.settings?.imageProvider === "api";
    // 과금 방지 가드 — API Key 모드 진입은 danger 다이얼로그 확인 후에만 (§5.4)
    if (wantApi && !wasApi) {
      dlgSet.close();
      const ok = await confirmBilling();
      if (!ok) return;
    }
    try {
      const { settings } = await api("POST", "/api/settings", {
        writerEngine: $("#setWriter").value,
        imageEngine: $("#setImage").value,
        imageProvider: $("#setProvider").value,
        confirmBilling: wantApi,
      });
      S.settings = settings;
      dlgSet.close();
      await refreshStatus();
    } catch (err) {
      dlgSet.close();
      S.error = { message: err.message };
      render();
    }
  });
}

function confirmBilling() {
  return new Promise((resolve) => {
    const dlg = $("#dlgBilling");
    dlg.showModal();
    $("#btnBillingCancel").onclick = () => { dlg.close(); resolve(false); };
    $("#btnBillingConfirm").onclick = () => { dlg.close(); resolve(true); };
  });
}

/* ── 부트스트랩 ─────────────────────────────────── */
(async function boot() {
  await Promise.all([refreshStatus(), loadProjects(), initDialogs()]);
  render();
  setInterval(refreshStatus, 20_000);
})();
