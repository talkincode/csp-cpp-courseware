(() => {
  const catalogUrl = "/glossary/faq.json";
  const root = document.body;
  const lessonTermIds = (root.dataset.faqTerms ?? "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  const style = document.createElement("style");
  style.textContent = `
    .faq-term {
      display: inline;
      margin: 0;
      padding: 0 1px;
      color: #9f3b20;
      background: rgba(243, 186, 118, 0.26);
      border: 0;
      border-bottom: 1px dashed #e6612c;
      border-radius: 2px;
      font: inherit;
      font-family: "SF Mono", "Menlo", monospace;
      font-size: 0.92em;
      line-height: inherit;
      cursor: help;
    }

    .faq-term:hover,
    .faq-term[aria-expanded="true"] {
      color: #0c2620;
      background: #f3ba76;
    }

    .terminal .faq-term,
    .terminal .faq-term:hover,
    .terminal .faq-term[aria-expanded="true"] {
      padding: 0 6px;
      color: #0c2620;
      background: #f8c85f;
      border-bottom-color: #d9a63a;
    }

    .faq-open {
      padding: 8px 11px;
      color: var(--paper, #fffaf0);
      background: transparent;
      border: 1px solid rgba(255, 250, 240, 0.44);
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .faq-open:hover {
      color: var(--forest, #0c2620);
      background: var(--orange-soft, #f3ba76);
    }

    .faq-shell {
      position: fixed;
      inset: 0;
      z-index: 30;
      pointer-events: none;
    }

    .faq-shell.is-open {
      pointer-events: auto;
    }

    .faq-backdrop {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      background: rgba(7, 26, 22, 0.38);
      border: 0;
      cursor: pointer;
      opacity: 0;
      transition: opacity 160ms ease;
    }

    .faq-shell.is-open .faq-backdrop {
      opacity: 1;
    }

    .faq-panel {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: flex;
      flex-direction: column;
      width: min(400px, calc(100vw - 24px));
      max-height: min(72vh, calc(100% - 24px));
      overflow: auto;
      color: var(--ink, #18372f);
      background: var(--paper-bright, #fffaf0);
      border: 1px solid rgba(24, 55, 47, 0.2);
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(1, 16, 12, 0.28);
      opacity: 0;
      transform: translateY(16px);
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .faq-shell.is-open .faq-panel {
      opacity: 1;
      transform: none;
    }

    .faq-panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 22px 20px 12px;
    }

    .faq-panel-header h2 {
      margin: 0;
      font-family: "Songti SC", "STSong", serif;
      font-size: 1.45rem;
    }

    .faq-close {
      padding: 6px 10px;
      color: var(--forest, #0c2620);
      background: transparent;
      border: 1px solid rgba(24, 55, 47, 0.28);
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 800;
    }

    .faq-status,
    .faq-answer,
    .faq-remember,
    .faq-links,
    .faq-list {
      padding: 0 20px;
    }

    .faq-status,
    .faq-list-label {
      color: #52675d;
      font-size: 0.78rem;
      line-height: 1.55;
    }

    .faq-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 18px;
      padding-bottom: 4px;
    }

    .faq-chip {
      padding: 6px 9px;
      color: var(--forest, #0c2620);
      background: #d7e6cd;
      border: 0;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 800;
    }

    .faq-chip[aria-current="true"] {
      color: #fffaf0;
      background: #e6612c;
    }

    .faq-answer h3 {
      margin: 0 0 8px;
      font-family: "Songti SC", "STSong", serif;
      font-size: 1.2rem;
    }

    .faq-answer p,
    .faq-remember,
    .faq-links {
      margin: 0 0 14px;
      font-size: 0.88rem;
      line-height: 1.7;
    }

    .faq-remember {
      padding: 10px 12px 10px;
      color: #6e421e;
      background: #fff0d5;
      border-top: 3px solid #e6612c;
    }

    .faq-links {
      display: grid;
      gap: 6px;
      margin-bottom: 28px;
      padding-bottom: 24px;
    }

    .faq-links a {
      color: #9f3b20;
      font-size: 0.8rem;
    }

    .faq-empty {
      padding: 0 20px 24px;
      color: #ad4325;
      font-size: 0.86rem;
      line-height: 1.6;
    }

    .faq-retry {
      margin: 0 20px 14px;
      padding: 9px 12px;
      color: #9f3b20;
      background: #fff0d5;
      border: 1px solid #e6612c;
      border-radius: 5px;
      font-size: 0.84rem;
      font-weight: 800;
      cursor: pointer;
    }

    .faq-retry:hover {
      color: #fffaf0;
      background: #9f3b20;
    }

    .faq-continue {
      margin: 0 20px 20px;
      padding: 10px 12px;
      color: #0c2620;
      background: #f3ba76;
      border: 0;
      border-radius: 5px;
      font-size: 0.84rem;
      font-weight: 800;
    }

    @media (prefers-reduced-motion: reduce) {
      .faq-backdrop,
      .faq-panel {
        transition: none;
      }
    }
  `;
  document.head.append(style);

  const shell = document.createElement("div");
  shell.className = "faq-shell";
  shell.id = "faqShell";
  shell.hidden = true;
  shell.innerHTML = `
    <button class="faq-backdrop" type="button" data-faq-close aria-label="关闭常见问题，返回课件"></button>
    <aside class="faq-panel" id="faqPanel">
      <div class="faq-panel-header">
        <h2 id="faqPanelTitle" tabindex="-1">常见问题</h2>
        <button class="faq-close" type="button" data-faq-close>关闭</button>
      </div>
      <p class="faq-status" data-faq-status role="status" aria-live="polite">正在载入本课名词解释…</p>
      <div class="faq-list" data-faq-list hidden></div>
      <div class="faq-answer" data-faq-answer hidden></div>
      <p class="faq-remember" data-faq-remember hidden></p>
      <div class="faq-links" data-faq-links hidden></div>
      <p class="faq-empty" data-faq-empty hidden></p>
      <button class="faq-retry" type="button" data-faq-retry hidden>重新载入词条表</button>
      <button class="faq-continue" type="button" data-faq-close>继续学习</button>
    </aside>
  `;
  document.body.append(shell);
  const panel = shell.querySelector("#faqPanel");

  const statusNode = panel.querySelector("[data-faq-status]");
  const listNode = panel.querySelector("[data-faq-list]");
  const answerNode = panel.querySelector("[data-faq-answer]");
  const rememberNode = panel.querySelector("[data-faq-remember]");
  const linksNode = panel.querySelector("[data-faq-links]");
  const emptyNode = panel.querySelector("[data-faq-empty]");
  const retryNode = panel.querySelector("[data-faq-retry]");

  let catalog = new Map();
  let catalogState = "loading";
  let loadingCatalog = false;
  let lastTrigger = null;
  let pendingTermId = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return entities[character];
    });
  }

  function lessonTerms() {
    const preferred = lessonTermIds.map((id) => catalog.get(id)).filter(Boolean);
    return preferred.length > 0 ? preferred : [...catalog.values()];
  }

  function openPanel() {
    shell.hidden = false;
    requestAnimationFrame(() => shell.classList.add("is-open"));
  }

  function closePanel() {
    shell.classList.remove("is-open");
    window.setTimeout(() => {
      if (!shell.classList.contains("is-open")) shell.hidden = true;
    }, 180);
    document.querySelectorAll(".faq-term[aria-expanded='true']").forEach((node) => {
      node.setAttribute("aria-expanded", "false");
    });
    if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
  }

  function renderList(activeId) {
    const terms = lessonTerms();
    listNode.hidden = terms.length === 0;
    listNode.innerHTML = terms
      .map(
        (term) => `
          <button class="faq-chip" type="button" data-faq="${escapeHtml(term.id)}" aria-current="${term.id === activeId}">
            ${escapeHtml(term.term)}
          </button>
        `,
      )
      .join("");
  }

  function showTerm(id, trigger) {
    lastTrigger = trigger ?? lastTrigger;
    pendingTermId = id;
    openPanel();

    if (catalogState !== "ready") {
      answerNode.hidden = true;
      rememberNode.hidden = true;
      linksNode.hidden = true;
      if (catalogState === "failed") {
        reportCatalogFailure();
      } else {
        statusNode.textContent = "正在载入本课名词解释…";
        emptyNode.hidden = true;
      }
      return;
    }

    const term = catalog.get(id);
    renderList(id);

    document.querySelectorAll(".faq-term[aria-expanded]").forEach((node) => {
      node.setAttribute("aria-expanded", "false");
    });
    if (trigger) trigger.setAttribute("aria-expanded", "true");

    if (!term) {
      statusNode.textContent = "这是本课出现的名词，但词条还没有写入常见问题表。";
      answerNode.hidden = true;
      rememberNode.hidden = true;
      linksNode.hidden = true;
      emptyNode.hidden = false;
      emptyNode.textContent = `找不到词条：${id}。课件仍可继续学习，请稍后查看词条表。`;
      return;
    }

    statusNode.textContent = term.summary;
    answerNode.hidden = false;
    answerNode.innerHTML = `<h3>${escapeHtml(term.term)}</h3><p>${escapeHtml(term.answer)}</p>`;
    rememberNode.hidden = false;
    rememberNode.textContent = `现在记住：${term.remember}`;
    const links = Array.isArray(term.links) ? term.links : [];
    linksNode.hidden = links.length === 0;
    linksNode.innerHTML = links
      .map(
        (link) =>
          `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link.title)}</a>`,
      )
      .join("");
    emptyNode.hidden = true;
    panel.querySelector("#faqPanelTitle")?.focus?.();
  }

  // 词条表载入失败必须当场说明，并留下重新载入的入口：全部 40 节课共用
  // 这个面板，失败时不能只留一个空白面板，也不能让课件其他互动停摆。
  function reportCatalogFailure() {
    catalogState = "failed";
    catalog = new Map();
    statusNode.textContent = "常见问题表暂时无法载入，课件其他部分不受影响。";
    listNode.hidden = true;
    emptyNode.hidden = false;
    emptyNode.textContent = "词条载入失败时，课件仍可继续。请确认本地服务正在运行，然后点“重新载入词条表”。";
    retryNode.hidden = false;
  }

  function loadCatalog() {
    if (loadingCatalog) return;
    loadingCatalog = true;
    catalogState = "loading";
    retryNode.hidden = true;
    statusNode.textContent = "正在载入本课名词解释…";
    fetch(catalogUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`FAQ catalog HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const terms = Array.isArray(payload?.terms) ? payload.terms : [];
        catalog = new Map(terms.map((term) => [term.id, term]));
        catalogState = "ready";
        emptyNode.hidden = true;
        statusNode.textContent = "点课件里带虚线的词，或点上方“常见问题”，只会看到基础解释。";
        if (pendingTermId) showTerm(pendingTermId, lastTrigger);
        else renderList(lessonTerms()[0]?.id);
      })
      .catch(() => {
        reportCatalogFailure();
      })
      .finally(() => {
        loadingCatalog = false;
      });
  }

  function bindCatalogButton() {
    const button = document.querySelector("#faqCatalogButton");
    if (!button) return;
    button.addEventListener("click", () => {
      lastTrigger = button;
      const first = lessonTerms()[0];
      if (first) showTerm(first.id, button);
      else {
        openPanel();
        if (catalogState === "failed") reportCatalogFailure();
        else statusNode.textContent = "常见问题表还没有载入。";
      }
    });
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-faq]");
    if (!trigger || trigger.hasAttribute("data-faq-close")) return;
    event.preventDefault();
    showTerm(trigger.dataset.faq, trigger);
  });

  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-faq-close]")) closePanel();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("is-open")) {
      event.preventDefault();
      closePanel();
    }
  });

  bindCatalogButton();

  retryNode.addEventListener("click", () => {
    loadCatalog();
  });

  loadCatalog();
})();
