/* Beat It – client-side cancer information search. No external dependencies. */
(function () {
  "use strict";

  const state = { cancers: [], faq: [], updates: null, docs: [], byId: {} };
  const $ = (sel) => document.querySelector(sel);
  const view = () => $("#view");
  const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how",
    "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who",
    "why", "with", "about", "any", "there", "new", "latest", "best"]);

  // ---------------------------------------------------------------- helpers
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "href") node.setAttribute("href", safeHref(v));
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  function safeHref(url) {
    const s = String(url || "");
    if (s.startsWith("#")) return s;
    try {
      const u = new URL(s, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
    } catch (_) { return "#"; }
  }
  const extLink = (url, text, cls) => el("a", { href: url, class: cls, target: "_blank", rel: "noopener noreferrer" }, text);
  const tokens = (s) => String(s || "").toLowerCase().split(/[^a-z0-9α-ω\-]+/i).filter((t) => t && !STOP.has(t));
  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  const typeTag = (id) => state.byId[id] ? el("a", { class: "tag", href: "#/type/" + id }, state.byId[id].name) : null;
  const pubmedSearch = (q) => "https://pubmed.ncbi.nlm.nih.gov/?" + new URLSearchParams({ term: q, sort: "date" });
  const trialsSearch = (q) => "https://clinicaltrials.gov/search?" + new URLSearchParams({ cond: q, aggFilters: "status:rec" });

  // ---------------------------------------------------------------- data
  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + ": HTTP " + res.status);
    return res.json();
  }

  function buildIndex() {
    const docs = [];
    const add = (d) => { d.hay = tokens([d.title, d.text].join(" ")); d.titleTokens = tokens(d.title); docs.push(d); };
    for (const c of state.cancers) {
      add({ kind: "Cancer type", title: c.name, text: [c.aliases, c.summary, c.symptoms, c.riskFactors, c.screening, c.treatments, c.group].flat().join(" "),
        types: [c.id], href: "#/type/" + c.id, desc: c.summary });
      for (const m of c.medicines) {
        add({ kind: "Medicine", title: m.name, text: m.use + " " + c.name + " " + c.aliases.join(" "), types: [c.id], href: "#/type/" + c.id, desc: m.use });
      }
      for (const t of c.treatments) {
        add({ kind: "Treatment", title: t, text: c.name + " " + c.aliases.join(" "), types: [c.id], href: "#/type/" + c.id, desc: "Treatment option for " + c.name.toLowerCase() });
      }
      const u = (state.updates && state.updates.byType && state.updates.byType[c.id]) || {};
      for (const r of u.research || []) {
        add({ kind: "Research", title: r.title, text: (r.journal || "") + " " + c.name, types: [c.id], url: r.url, desc: [r.journal, r.date].filter(Boolean).join(" · ") });
      }
      for (const t of u.trials || []) {
        add({ kind: "Clinical trial", title: t.title, text: [t.phase, t.status, c.name, "trial"].join(" "), types: [c.id], url: t.url, desc: [t.nctId, t.phase, t.status].filter(Boolean).join(" · ") });
      }
    }
    for (const f of state.faq) add({ kind: "Question", title: f.q, text: f.a, types: [], url: f.link, desc: f.a });
    for (const n of (state.updates && state.updates.news) || []) {
      add({ kind: "News", title: n.title, text: n.summary || "", types: n.types || [], url: n.url, desc: [n.source, fmtDate(n.date)].filter(Boolean).join(" · ") });
    }
    state.docs = docs;
  }

  function mentionedTypes(q) {
    const low = q.toLowerCase();
    return state.cancers.filter((c) => [c.name.split("(")[0].trim(), c.id.replace("-", " "), ...c.aliases]
      .some((n) => n.length >= 3 && new RegExp("\\b" + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(low)))
      .map((c) => c.id);
  }

  function search(q) {
    const qt = tokens(q);
    if (!qt.length) return [];
    const typeHits = new Set(mentionedTypes(q));
    const phrase = q.trim().toLowerCase();
    const matches = (hay, t) => hay.some((w) => w === t || (t.length >= 3 && w.startsWith(t)));
    const scored = state.docs.map((d) => {
      let hit = 0, score = 0;
      for (const t of qt) {
        if (matches(d.titleTokens, t)) { hit++; score += 3; } else if (matches(d.hay, t)) { hit++; score += 1; }
      }
      if (d.title.toLowerCase().includes(phrase)) score += 6;
      if (d.types.some((id) => typeHits.has(id))) score += 2;
      if (d.kind === "Cancer type" && typeHits.has(d.types[0])) score += 3;
      return { d, hit, score };
    }).filter((r) => r.hit > 0);
    const all = scored.filter((r) => r.hit === qt.length);
    const pool = all.length ? all : scored.filter((r) => r.hit >= Math.ceil(qt.length / 2));
    return pool.sort((a, b) => b.score - a.score).slice(0, 60).map((r) => r.d);
  }

  // ---------------------------------------------------------------- views
  function renderNav(active) {
    const nav = $("#type-nav");
    nav.replaceChildren();
    nav.append(el("a", { class: "chip", href: "#/", "aria-current": active ? "false" : "true" }, "All types"));
    const groups = [...new Set(state.cancers.map((c) => c.group))];
    for (const g of groups) {
      nav.append(el("span", { class: "chip-group" }, g + ":"));
      for (const c of state.cancers.filter((x) => x.group === g)) {
        nav.append(el("a", { class: "chip", href: "#/type/" + c.id, "aria-current": c.id === active ? "true" : "false" }, c.name));
      }
    }
  }

  function newsList(items, emptyText) {
    if (!items.length) return el("p", { class: "empty" }, emptyText);
    return el("ul", { class: "items" }, items.map((n) =>
      el("li", {}, extLink(n.url, n.title, "title"),
        el("div", { class: "meta" }, [n.source, fmtDate(n.date)].filter(Boolean).join(" · ")),
        el("div", {}, (n.types || []).map(typeTag)))));
  }

  function pendingNotice() {
    return state.updates && state.updates.generatedAt ? null
      : el("p", { class: "notice" }, "Latest research, trials and news are fetched automatically every week. The first update has not run yet — use the PubMed and ClinicalTrials.gov links to search live.");
  }

  function renderHome() {
    document.title = "Beat It – Cancer information, treatments & latest research";
    renderNav(null);
    $("#status").textContent = "";
    const v = view();
    v.replaceChildren();
    const groups = [...new Set(state.cancers.map((c) => c.group))];
    for (const g of groups) {
      v.append(el("h2", {}, g));
      v.append(el("div", { class: "grid" }, state.cancers.filter((c) => c.group === g).map((c) => {
        const u = (state.updates.byType || {})[c.id] || {};
        return el("article", { class: "card", "data-type": c.id },
          el("h3", {}, el("a", { class: "title", href: "#/type/" + c.id }, c.name)),
          el("p", {}, c.summary.split(". ")[0] + "."),
          el("p", { class: "meta" }, `${c.medicines.length} medicine groups · ${(u.research || []).length} new papers · ${(u.trials || []).length} recruiting trials`));
      })));
    }
    v.append(el("h2", { id: "news" }, "Latest cancer news worldwide"));
    const notice = pendingNotice();
    if (notice) v.append(notice);
    v.append(el("div", { class: "card" }, newsList((state.updates.news || []).slice(0, 15), "No news items yet.")));
    v.append(el("h2", {}, "Common questions"));
    v.append(...state.faq.map((f) => el("details", { class: "faq" }, el("summary", {}, f.q), el("p", {}, f.a), extLink(f.link, "Learn more"))));
  }

  function section(title, ...content) { return el("section", { class: "card" }, el("h3", {}, title), ...content); }
  const bullets = (arr) => el("ul", { class: "list" }, arr.map((x) => el("li", {}, x)));

  function renderType(id) {
    const c = state.byId[id];
    if (!c) return renderHome();
    document.title = c.name + " – Beat It";
    renderNav(id);
    $("#status").textContent = "";
    const u = (state.updates.byType || {})[id] || {};
    const news = (state.updates.news || []).filter((n) => (n.types || []).includes(id));
    const v = view();
    v.replaceChildren(
      el("h2", {}, c.name),
      el("p", {}, c.summary),
      el("div", { class: "ext" },
        extLink(c.nci, "NCI overview"),
        extLink(pubmedSearch(c.query), "Search PubMed"),
        extLink(trialsSearch(c.query), "Find recruiting trials"),
        extLink("https://www.cancer.gov/about-cancer/treatment/drugs/cancer-type", "NCI drug lists")),
      el("div", { class: "two-col" },
        section("Common symptoms", bullets(c.symptoms)),
        section("Risk factors", bullets(c.riskFactors)),
        section("Screening & early detection", el("p", {}, c.screening)),
        section("Treatment options", bullets(c.treatments))),
      el("h2", {}, "Medicines"),
      el("div", { class: "card" },
        el("table", { class: "meds" },
          el("thead", {}, el("tr", {}, el("th", {}, "Medicine"), el("th", {}, "How it is used"))),
          el("tbody", {}, c.medicines.map((m) => el("tr", {}, el("td", {}, m.name), el("td", {}, m.use))))),
        el("p", { class: "meta" }, "Examples of approved medicines; not a complete list. Eligibility depends on stage, biomarkers and prior treatment.")),
      el("h2", {}, "Latest research"),
      pendingNotice() || "",
      el("div", { class: "card" }, (u.research || []).length
        ? el("ul", { class: "items" }, u.research.map((r) => el("li", {}, extLink(r.url, r.title, "title"), el("div", { class: "meta" }, [r.journal, r.date].filter(Boolean).join(" · ")))))
        : el("p", { class: "empty" }, "No recent papers saved yet. ", extLink(pubmedSearch(c.query), "Search PubMed now"))),
      el("h2", {}, "Recruiting clinical trials"),
      el("div", { class: "card" }, (u.trials || []).length
        ? el("ul", { class: "items" }, u.trials.map((t) => el("li", {}, extLink(t.url, t.title, "title"), el("div", { class: "meta" }, [t.nctId, t.phase, t.status, t.updated && "updated " + t.updated].filter(Boolean).join(" · ")))))
        : el("p", { class: "empty" }, "No trials saved yet. ", extLink(trialsSearch(c.query), "Search ClinicalTrials.gov"))),
      el("h2", {}, "News"),
      el("div", { class: "card" }, newsList(news, "No recent news tagged for this cancer type.")));
    window.scrollTo(0, 0);
  }

  function renderSearch(q) {
    document.title = q + " – Beat It search";
    $("#q").value = q;
    const types = mentionedTypes(q);
    renderNav(types.length === 1 ? types[0] : null);
    const results = search(q);
    $("#status").textContent = results.length ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”` : `No results on this site for “${q}”.`;
    const v = view();
    v.replaceChildren(
      el("div", { class: "ext" },
        el("span", { class: "meta" }, "Search live: "),
        extLink(pubmedSearch(q), "PubMed"),
        extLink(trialsSearch(q), "ClinicalTrials.gov"),
        extLink("https://www.cancer.gov/search/results?swKeyword=" + encodeURIComponent(q), "cancer.gov"),
        extLink("https://www.who.int/home/search-results?indexCatalogue=genericsearchindex1&searchQuery=" + encodeURIComponent(q), "WHO")),
      el("div", { class: "grid", id: "results" }, results.map((d) =>
        el("article", { class: "card result" },
          el("span", { class: "kind" }, d.kind),
          el("h3", {}, d.url ? extLink(d.url, d.title, "title") : el("a", { class: "title", href: d.href }, d.title)),
          d.desc ? el("p", { class: "meta" }, d.desc.length > 220 ? d.desc.slice(0, 217) + "…" : d.desc) : null,
          el("div", {}, d.types.map(typeTag))))));
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("type/")) return renderType(decodeURIComponent(h.slice(5)));
    if (h.startsWith("search/")) return renderSearch(decodeURIComponent(h.slice(7)));
    $("#q").value = "";
    return renderHome();
  }

  async function init() {
    $("#status").textContent = "Loading…";
    try {
      const [cancers, faq, updates] = await Promise.all([
        loadJSON("data/cancers.json"), loadJSON("data/faq.json"),
        loadJSON("data/updates.json").catch(() => ({ byType: {}, news: [] }))]);
      Object.assign(state, { cancers, faq, updates });
      state.byId = Object.fromEntries(cancers.map((c) => [c.id, c]));
      buildIndex();
    } catch (err) {
      $("#status").textContent = "Could not load data: " + err.message;
      return;
    }
    if (state.updates.generatedAt) $("#updated").textContent = "Last updated " + fmtDate(state.updates.generatedAt) + ".";
    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("#q").value.trim();
      location.hash = q ? "#/search/" + encodeURIComponent(q) : "#/";
    });
    $("#home-link").addEventListener("click", (e) => { e.preventDefault(); location.hash = "#/"; });
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
