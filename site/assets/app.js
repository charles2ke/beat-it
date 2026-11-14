/* Beat It – client app: routing, rendering, search and SEO metadata. No external dependencies. */
(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || doc).querySelectorAll(sel));
  const BASE = new URL(doc.baseURI);
  const SITE = (() => {
    const meta = $('meta[name="site-url"]');
    const s = (meta && meta.content) || BASE.href;
    return s.endsWith("/") ? s : s + "/";
  })();
  const SITE_NAME = "Beat It";
  const HOME_TITLE = "Beat It – Cancer information, treatments & latest research";
  const HOME_DESC = "Free, searchable guide to 22 cancer types: symptoms, screening, treatments, approved medicines, new FDA approvals, recruiting clinical trials and the latest research and news, refreshed weekly from trusted sources.";
  const NCI_DRUGS = "https://www.cancer.gov/about-cancer/treatment/drugs/cancer-type";
  const REPO = "https://github.com/charles2ke/beat-it";

  const state = {
    cancers: [], faq: [], facts: null, updates: { byType: {}, news: [] },
    byId: {}, docs: [], vocab: new Map(), vocabKeys: [], approvals: [], ready: false, route: null, key: "",
  };

  // ---------------------------------------------------------------- icons
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    ribbon: '<path d="M6 21 13.6 10.2C14.6 8.8 15 7.6 15 6.5a3 3 0 0 0-6 0c0 1.1.4 2.3 1.4 3.7L18 21"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    flask: '<path d="M9 3h6M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/>',
    book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h14"/><path d="M9 7h7M9 11h5"/>',
    news: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2Z"/><path d="M17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
    heart: '<path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 7.5 6.6Z"/>',
    sparkles: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4ZM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.6c-.6.3-1 .9-1 1.6v.5M12 17h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    home: '<path d="m3 11 9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  };
  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(name, cls) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ico" + (cls ? " " + cls : ""));
    svg.innerHTML = ICONS[name] || ICONS.ribbon; // static, trusted markup only
    return svg;
  }

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, attrs, ...children) {
    const node = doc.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "href") node.setAttribute("href", safeHref(v));
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false || c === "") continue;
      node.append(c instanceof Node ? c : doc.createTextNode(String(c)));
    }
    return node;
  }
  // Only http(s) and same-site relative links are allowed; anything else (javascript:, data:, …) becomes "#".
  function safeHref(url) {
    const s = String(url == null ? "" : url).trim();
    if (!s) return "#";
    if (s.startsWith("#")) return s;
    try {
      const u = new URL(s, BASE);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "#";
      return /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//") ? u.href : s;
    } catch (_) { return "#"; }
  }
  function extLink(url, text, cls, withIcon) {
    const a = el("a", { href: url, class: cls, target: "_blank", rel: "noopener noreferrer" }, text);
    if (withIcon) a.append(icon("external"));
    return a;
  }
  function setStatus(text, visible) {
    const s = $("#status");
    s.textContent = text || "";
    s.classList.toggle("sr-only", !visible);
  }

  // ---------------------------------------------------------------- formatting
  const noun = (n, word, many) => (n === 1 ? word : many || word + "s");
  const plural = (n, word, many) => n + " " + noun(n, word, many);
  const firstSentence = (s) => { const m = String(s || "").match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : String(s || ""); };
  const shortName = (c) => c.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+cancers?$/i, "").trim();
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
  const typeHref = (id, hash) => "type/" + encodeURIComponent(id) + "/" + (hash ? "#" + hash : "");
  const searchHref = (q) => "./?" + new URLSearchParams({ q });
  const pubmedSearch = (q) => "https://pubmed.ncbi.nlm.nih.gov/?" + new URLSearchParams({ term: q, sort: "date" });
  const trialsSearch = (q) => "https://clinicaltrials.gov/search?" + new URLSearchParams({ cond: q, aggFilters: "status:rec" });
  const pmcHref = (id) => (/^PMC\d+$/.test(String(id || "")) ? "https://pmc.ncbi.nlm.nih.gov/articles/" + id + "/" : "");
  const feedHref = (id) => (id ? typeHref(id) : "") + "feed.xml";
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

  function parseDate(s) {
    const str = String(s || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T00:00:00Z");
    if (/^\d{4}-\d{2}$/.test(str)) return new Date(str + "-01T00:00:00Z");
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return new Date(str);
    return null;
  }
  // Dates are rendered in UTC with a fixed locale so prerendered HTML matches the client render.
  function fmtDate(s) {
    const d = parseDate(s);
    if (!d || isNaN(d)) return s ? String(s) : "";
    const opts = { year: "numeric", month: "short", timeZone: "UTC" };
    if (!/^\d{4}-\d{2}$/.test(s)) opts.day = "numeric";
    return d.toLocaleDateString("en-US", opts);
  }
  const byDateDesc = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  function prettyPhase(p) {
    const s = String(p || "").trim();
    return !s || /^(n\/?a|na)$/i.test(s) ? "" : s.replace(/_/g, " ").replace(/\bPHASE(\d)/gi, "Phase $1");
  }
  function dataDate() { return parseDate(state.updates.generatedAt) || new Date(); }
  function isRecent(dateStr, months) {
    const d = parseDate(dateStr);
    if (!d) return false;
    const ref = dataDate();
    const cutoff = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - months, ref.getUTCDate()));
    return d >= cutoff;
  }

  // ---------------------------------------------------------------- news helpers
  const CAT_LABEL = { official: "Official", research: "Science", media: "Press" };
  // Fallback for data written before the updater recorded categories (mirrors classify_source).
  const OFFICIAL_ACRONYMS = /\b(WHO|NCI|NIH|FDA|CDC|IARC|NHS|ESMO|ASCO|AACR)\b/;
  const OFFICIAL_RE = /world health|national cancer institute|national institutes of health|food and drug|centers for disease control|cancer research uk|american cancer society|macmillan/i;
  const RESEARCH_RE = /science ?daily|medical ?xpress|eurekalert|newswise|asco post|ecancer|nature|lancet|nejm|jama|bmj|cell press|technology networks|news-medical|bioengineer|scitechdaily/i;
  function newsCat(n) {
    if (n.category && CAT_LABEL[n.category]) return n.category;
    const src = n.source || "";
    if (RESEARCH_RE.test(src)) return "research";
    if (OFFICIAL_ACRONYMS.test(src) || OFFICIAL_RE.test(src)) return "official";
    return "media";
  }
  function cleanTitle(n) {
    const t = String(n.title || "");
    if (!n.source) return t;
    const src = String(n.source).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return t.replace(new RegExp("(?:\\s+[-|–—]\\s+" + src + ")+$"), "") || t;
  }
  function initials(source) {
    const s = String(source || "?").replace(/\s*[-–|].*$/, "").trim();
    if (/^[A-Z0-9&]{2,4}$/.test(s)) return s;
    const words = s.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (words[0] || "?").slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  }

  // ---------------------------------------------------------------- search engine
  const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how",
    "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who",
    "why", "with", "about", "any", "there", "new", "latest", "best", "your", "you", "should", "get", "will"]);
  const BRITISH = [[/tumour/g, "tumor"], [/leukaem/g, "leukem"], [/oesophag/g, "esophag"], [/paediatr/g, "pediatr"],
    [/haem/g, "hem"], [/anaem/g, "anem"], [/oestr/g, "estr"], [/colour/g, "color"], [/centre/g, "center"], [/foetal/g, "fetal"]];
  // Null prototype so query words such as "constructor" don't match inherited Object properties.
  const SYN = Object.assign(Object.create(null), {
    chemo: ["chemotherapy"], immuno: ["immunotherapy"], radiotherapy: ["radiation"], radiation: ["radiotherapy"],
    bowel: ["colorectal", "colon"], colon: ["colorectal"], rectal: ["colorectal"], rectum: ["colorectal"],
    skin: ["melanoma"], blood: ["leukemia", "lymphoma", "myeloma"], kidney: ["renal"], renal: ["kidney"],
    stomach: ["gastric"], gastric: ["stomach"], womb: ["uterine", "endometrial"], uterus: ["uterine"], endometrial: ["uterine"],
    cervix: ["cervical"], ovary: ["ovarian"], ovaries: ["ovarian"], pancreas: ["pancreatic"], prostrate: ["prostate"],
    esophagus: ["esophageal"], gullet: ["esophageal"], throat: ["head", "esophageal"], mouth: ["oral", "head"],
    brain: ["glioma", "glioblastoma"], bone: ["sarcoma", "myeloma"], kids: ["childhood", "pediatric", "children"],
    children: ["childhood", "pediatric"], child: ["childhood", "pediatric"], pediatric: ["childhood"],
    drug: ["medicine", "medicines"], drugs: ["medicine", "medicines"], medication: ["medicine"], medications: ["medicine"],
    meds: ["medicine"], study: ["trial", "studies"], studies: ["trial", "trials"], tumor: ["cancer"], tumors: ["cancer"],
    carcinoma: ["cancer"], liver: ["hepatocellular"], hcc: ["hepatocellular", "liver"], nsclc: ["nonsmall"],
    tnbc: ["triplenegative"], hpv: ["papillomavirus"], mammogram: ["mammography"], mammograms: ["mammography"],
    pap: ["cytology", "smear"], cart: ["car"], symptom: ["symptoms", "signs"], signs: ["symptoms"],
    treat: ["treatment", "therapy"], treatments: ["treatment", "therapy"], therapy: ["treatment"],
    vaccine: ["vaccines", "vaccination"], gene: ["genetic", "mutation"], genetic: ["inherited", "gene", "mutation"],
    hereditary: ["inherited", "genetic"], screen: ["screening"], test: ["screening", "testing"], tests: ["screening", "test"],
    adc: ["antibodydrug", "conjugate"], adcs: ["antibodydrug", "conjugate"], lymph: ["lymphoma"], marrow: ["myeloma", "leukemia"],
    bispecific: ["bispecifics"], bispecifics: ["bispecific"],
  });
  const KINDS = ["Cancer type", "Medicine", "Approval", "Treatment", "Question", "Research", "Clinical trial", "News"];
  const KIND_ORDER = Object.fromEntries(KINDS.map((k, i) => [k, i]));
  const KIND_WEIGHT = { "Cancer type": 2, Medicine: 1.5, Approval: 1.5, Treatment: 1, Question: 1 };
  const KIND_ICON = { "Cancer type": "ribbon", Medicine: "pill", Approval: "sparkles", Treatment: "heart", Question: "help",
    Research: "book", "Clinical trial": "flask", News: "news" };

  function fold(s) {
    let t = String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [re, rep] of BRITISH) t = t.replace(re, rep);
    return t;
  }
  // Splits text into searchable words; hyphenated terms are indexed whole ("pdl1") and by part ("pd", "l1").
  function words(s) {
    const out = [];
    for (let raw of fold(s).split(/[^a-z0-9α-ω'’\-\/]+/)) {
      raw = raw.replace(/^[-\/'’]+|[-\/'’]+$/g, "");
      if (!raw) continue;
      if (/[-\/'’]/.test(raw)) {
        const parts = raw.split(/[-\/'’]+/).filter(Boolean);
        out.push({ whole: parts.join(""), parts });
      } else out.push({ whole: raw, parts: null });
    }
    return out;
  }
  function indexTokens(s) {
    const out = [];
    for (const w of words(s)) {
      out.push(w.whole);
      if (w.parts) out.push(...w.parts);
    }
    return out.filter((t) => !STOP.has(t));
  }
  const hasPrefix = (t) => state.vocabKeys.some((w) => w.startsWith(t));
  const inVocab = (t) => state.vocab.has(t) || (t.length >= 3 && hasPrefix(t));
  function queryTokens(q) {
    const out = [];
    for (const w of words(q)) {
      if (!w.parts || inVocab(w.whole)) out.push(w.whole);
      else out.push(...w.parts);
    }
    return out.filter((t) => !STOP.has(t));
  }

  // Optimal string alignment distance with an early exit once `max` is exceeded.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  function closestWord(t) {
    if (t.length < 4 || /\d/.test(t)) return null;
    const max = t.length <= 6 ? 1 : 2;
    let best = null, bestD = max + 1, bestF = 0;
    for (const w of state.vocabKeys) {
      if (w.length < 3 || Math.abs(w.length - t.length) > max) continue;
      const d = editDistance(t, w, max);
      const f = state.vocab.get(w);
      if (d < bestD || (d === bestD && f > bestF)) { best = w; bestD = d; bestF = f; }
    }
    return bestD <= max ? best : null;
  }

  // "brca1" also matches a search for "brca": gene and biomarker names often end in a number.
  function withStems(tokens) {
    const set = new Set(tokens);
    for (const t of tokens) {
      const stem = t.replace(/\d+$/, "");
      if (stem !== t && stem.length >= 3 && !/\d/.test(stem)) set.add(stem);
    }
    return set;
  }
  function addDoc(d) {
    d.types = d.types || [];
    d.titleFold = fold(d.title);
    d.titleTokens = indexTokens(d.title);
    d.textTokens = indexTokens(d.text || "");
    d.titleSet = withStems(d.titleTokens);
    d.textSet = withStems(d.textTokens);
    d.longTitle = d.titleTokens.length > 8; // paper and trial titles: a single word match means less
    for (const t of new Set(d.titleTokens.concat(d.textTokens))) state.vocab.set(t, (state.vocab.get(t) || 0) + 1);
    state.docs.push(d);
  }

  function buildIndex() {
    state.docs = [];
    state.vocab = new Map();
    // The same medicine or treatment is listed for many cancer types: index each once.
    const medicines = new Map();
    const treatments = new Map();
    const group = (map, name, entry) => {
      const key = fold(name);
      if (!map.has(key)) map.set(key, { title: name, entries: [] });
      map.get(key).entries.push(entry);
    };
    const typeNames = (c) => [c.name, c.aliases.join(" ")].join(" ");
    for (const c of state.cancers) {
      const names = typeNames(c);
      addDoc({ kind: "Cancer type", title: c.name, href: typeHref(c.id), types: [c.id], desc: c.summary,
        text: [c.aliases, c.summary, c.symptoms, c.riskFactors, c.screening, c.treatments, c.group,
          c.medicines.map((m) => m.name), "symptoms signs risk factors causes screening early detection treatment options"].flat().join(" ") });
      for (const m of c.medicines) group(medicines, m.name, { type: c.id, use: m.use, names });
      for (const t of c.treatments) group(treatments, t, { type: c.id, names });
      for (const a of state.approvals) {
        if (a.types[0] !== c.id) continue;
        addDoc({ kind: "Approval", title: a.drug, href: typeHref(c.id, "approvals"), types: a.types,
          desc: [fmtDate(a.date), a.text].filter(Boolean).join(" · "),
          text: [a.text, a.source, a.types.map((id) => typeNames(state.byId[id])), "approval approved fda new"].flat().join(" ") });
      }
      const u = state.updates.byType[c.id] || {};
      for (const r of u.research || []) {
        addDoc({ kind: "Research", title: r.title, url: r.url, types: [c.id], desc: [r.kind, r.journal, fmtDate(r.date)].filter(Boolean).join(" · "),
          text: [r.kind, r.journal, names, "research study paper"].join(" ") });
      }
      for (const t of u.trials || []) {
        addDoc({ kind: "Clinical trial", title: t.title, url: t.url, types: [c.id],
          desc: [t.nctId, prettyPhase(t.phase), t.status, t.ages ? "ages " + t.ages : ""].filter(Boolean).join(" · "),
          text: [t.nctId, t.phase, t.status, strings(t.countries), names, "clinical trial study"].flat().join(" ") });
      }
    }
    for (const m of medicines.values()) {
      const types = [...new Set(m.entries.map((e) => e.type))];
      const one = types.length === 1;
      addDoc({ kind: "Medicine", title: m.title, href: one ? typeHref(types[0], "medicines") : searchHref(m.title), types,
        desc: one ? m.entries.map((e) => e.use).join(" · ") : "", uses: one ? null : m.entries,
        text: m.entries.map((e) => e.use + " " + e.names).join(" ") + " medicine drug" });
    }
    for (const t of treatments.values()) {
      const types = [...new Set(t.entries.map((e) => e.type))];
      const one = types.length === 1 ? state.byId[types[0]] : null;
      addDoc({ kind: "Treatment", title: t.title, href: one ? typeHref(one.id, "overview") : searchHref(t.title), types,
        desc: "Treatment option for " + (one ? one.name.charAt(0).toLowerCase() + one.name.slice(1) : types.length + " cancer types"),
        text: t.entries.map((e) => e.names).join(" ") + " treatment" });
    }
    for (const f of state.faq) {
      addDoc({ kind: "Question", title: f.q, href: "./#faq-" + slug(f.q), url: f.link, desc: f.a, text: f.a });
    }
    for (const n of state.updates.news || []) {
      addDoc({ kind: "News", title: cleanTitle(n), url: n.url, types: n.types || [],
        desc: [n.source, fmtDate(n.date)].filter(Boolean).join(" · "), text: [n.summary, n.source, "news"].join(" ") });
    }
    state.vocabKeys = Array.from(state.vocab.keys());
  }

  function mentionedTypes(q) {
    const low = fold(q);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return state.cancers.filter((c) => [c.name.split("(")[0].trim(), c.id.replace("-", " "), ...c.aliases]
      .some((n) => n.length >= 3 && new RegExp("\\b" + esc(fold(n)) + "\\b").test(low))).map((c) => c.id);
  }

  function matchScore(d, alts, prefixMin) {
    let best = 0;
    for (const t of alts) {
      if (d.titleSet.has(t)) return d.longTitle ? 4 : 6;
      if (d.textSet.has(t)) best = Math.max(best, 3);
      if (t.length >= prefixMin) {
        if (best < 4 && d.titleTokens.some((w) => w.startsWith(t))) best = d.longTitle ? 3 : 4;
        else if (best < 2 && d.textTokens.some((w) => w.startsWith(t))) best = 2;
      }
    }
    return best;
  }

  // live=true is used while typing: the last word is treated as a prefix and not spell-corrected.
  function runSearch(q, live) {
    const toks = queryTokens(q);
    const empty = { results: [], corrected: "", re: null };
    if (!toks.length) return empty;
    let changed = false;
    const fixed = [];
    const groups = toks.map((t, i) => {
      const last = live && i === toks.length - 1;
      const alts = new Set([t]);
      if (t.length >= 5 && t.endsWith("ies")) alts.add(t.slice(0, -3) + "y");
      if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss")) alts.add(t.slice(0, -1));
      for (const s of SYN[t] || []) alts.add(s);
      let shown = t;
      if (!last && ![...alts].some(inVocab)) {
        const fix = closestWord(t);
        if (fix) { alts.add(fix); shown = fix; changed = true; }
      }
      fixed.push(shown);
      return { alts: [...alts], prefixMin: last ? 2 : 3 };
    });
    const phrase = fold(q).replace(/\s+/g, " ").trim();
    const typeHits = new Set(mentionedTypes(q));
    const scored = [];
    for (const d of state.docs) {
      let score = 0;
      let ok = true;
      for (const g of groups) {
        const s = matchScore(d, g.alts, g.prefixMin);
        if (!s) { ok = false; break; }
        score += s;
      }
      if (!ok) continue;
      if (phrase.includes(" ") && d.titleFold.includes(phrase)) score += d.longTitle ? 4 : 8;
      if (d.titleFold === phrase) score += 6;
      else if (groups.length === 1 && d.titleTokens.length === 1 && groups[0].alts.includes(d.titleTokens[0])) score += 6; // "chemo" → Chemotherapy
      if (d.types.some((id) => typeHits.has(id))) score += 2;
      if (d.kind === "Cancer type" && typeHits.has(d.types[0])) score += 6;
      score += KIND_WEIGHT[d.kind] || 0;
      scored.push({ d, score });
    }
    scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.d.kind] - KIND_ORDER[b.d.kind]);
    const terms = new Set();
    groups.forEach((g) => g.alts.forEach((t) => { if (t.length >= 2) terms.add(t); }));
    const esc = [...terms].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      results: scored.map((r) => r.d),
      corrected: changed ? fixed.join(" ") : "",
      re: esc.length ? new RegExp("\\b(?:" + esc.join("|") + ")", "gi") : null,
    };
  }

  function highlight(text, re) {
    const s = String(text || "");
    if (!re) return s;
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index > last) frag.append(s.slice(last, m.index));
      frag.append(el("mark", null, m[0]));
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.append(s.slice(last));
    return frag;
  }

  // ---------------------------------------------------------------- shared view parts
  function typeTag(id) {
    const c = state.byId[id];
    return c ? el("a", { class: "tag", href: typeHref(id), "data-accent": id }, c.name) : null;
  }
  const bullets = (arr) => el("ul", { class: "list" }, arr.map((x) => el("li", null, x)));
  function card(title, ic, ...content) {
    return el("section", { class: "card reveal" }, el("h3", null, el("span", { class: "card-ico" }, icon(ic)), title), ...content);
  }
  function section(id, ic, kicker, title, desc, aside, ...content) {
    return el("section", { class: "section", id, "aria-labelledby": id + "-h" },
      el("div", { class: "section-head" },
        el("div", null, el("span", { class: "kicker" }, icon(ic), kicker), el("h2", { id: id + "-h" }, title), desc ? el("p", null, desc) : null),
        aside),
      ...content);
  }
  function pendingNotice() {
    return state.updates.generatedAt ? null
      : el("p", { class: "notice" }, "Latest research, trials and news are fetched automatically every week. The first update has not run yet — use the PubMed and ClinicalTrials.gov links to search live.");
  }
  function newsItem(n) {
    const cat = newsCat(n);
    return el("article", { class: "news-item reveal", "data-cat": cat },
      el("span", { class: "src-badge", "data-cat": cat, "aria-hidden": "true" }, initials(n.source)),
      el("div", null,
        extLink(n.url, cleanTitle(n), "title"),
        el("div", { class: "news-meta" },
          el("span", { class: "badge " + cat }, CAT_LABEL[cat]),
          n.source ? el("span", null, n.source) : null,
          n.date ? el("time", { datetime: n.date }, fmtDate(n.date)) : null),
        (n.types || []).length ? el("div", { class: "news-tags" }, n.types.map(typeTag)) : null));
  }
  // Show-more + filter state for lists of [data-cat]/[data-kind] items.
  function pagedList(container, items, step, attr) {
    let limit = step;
    let filter = "all";
    const more = el("button", { type: "button", class: "btn" }, "Show more");
    const row = el("div", { class: "more-row" }, more);
    function apply() {
      let shown = 0;
      let total = 0;
      for (const node of items) {
        const match = filter === "all" || node.getAttribute(attr) === filter;
        if (match) total++;
        const vis = match && shown < limit;
        node.hidden = !vis;
        if (vis) shown++;
      }
      row.hidden = shown >= total;
      more.textContent = "Show more (" + (total - shown) + ")";
    }
    more.addEventListener("click", () => { limit += step; apply(); });
    container.append(...items);
    apply();
    return { row, setFilter(f) { filter = f; limit = step; apply(); } };
  }
  function filterBar(label, options, onChange) {
    const bar = el("div", { class: "news-tools", role: "group", "aria-label": label },
      options.map(([value, text, count], i) => el("button", { type: "button", class: "filter", "data-value": value, "aria-pressed": i === 0 ? "true" : "false" },
        text, count != null ? el("span", { class: "count" }, count) : null)));
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      $$("button", bar).forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      onChange(b.getAttribute("data-value"));
    });
    return bar;
  }

  // ---------------------------------------------------------------- home
  const SOURCES = [
    ["National Cancer Institute", "https://www.cancer.gov/", "Cancer type overviews, treatment summaries and drug information (NIH)."],
    ["U.S. FDA", "https://www.fda.gov/drugs/resources-information-approved-drugs/oncology-cancerhematologic-malignancies-approval-notifications", "Official oncology and hematology approval notifications."],
    ["WHO & IARC", "https://gco.iarc.who.int/", "Global cancer statistics (GLOBOCAN) and prevention guidance."],
    ["PubMed", "https://pubmed.ncbi.nlm.nih.gov/", "Newest peer-reviewed papers for every cancer type, refreshed weekly."],
    ["ClinicalTrials.gov", "https://clinicaltrials.gov/", "Recruiting interventional studies with eligible ages and locations, refreshed weekly."],
  ];
  const POPULAR = ["Immunotherapy", "CAR T-cell therapy", "HPV vaccine", "Lung cancer screening", "BRCA", "Antibody-drug conjugate"];

  function totals() {
    let papers = 0;
    let trials = 0;
    for (const u of Object.values(state.updates.byType || {})) {
      papers += (u.research || []).length;
      trials += (u.trials || []).length;
    }
    return { papers, trials, news: (state.updates.news || []).length };
  }

  function typeCard(c) {
    const u = state.updates.byType[c.id] || {};
    const fresh = (c.approvals || []).some((a) => isRecent(a.date, 12));
    return el("article", { class: "type-card reveal", "data-type": c.id, "data-accent": c.id },
      el("div", { class: "type-top" }, el("span", { class: "card-ico" }, icon("ribbon")), el("span", { class: "go" }, icon("arrow"))),
      el("h4", null, el("a", { href: typeHref(c.id) }, c.name)),
      el("p", null, firstSentence(c.summary)),
      el("ul", { class: "pills", "aria-label": "Highlights" },
        fresh ? el("li", { class: "hot" }, "New approvals") : null,
        el("li", null, plural(c.medicines.length, "medicine group")),
        (u.research || []).length ? el("li", null, plural(u.research.length, "new paper")) : null,
        (u.trials || []).length ? el("li", null, plural(u.trials.length, "trial")) : null));
  }

  function approvalCard(a) {
    return el("article", { class: "approval reveal", "data-accent": a.types[0] },
      el("time", { class: "approval-date", datetime: a.date }, fmtDate(a.date)),
      el("h3", null, a.drug),
      el("p", null, a.text),
      el("div", { class: "row" }, a.types.map(typeTag), a.url ? extLink(a.url, a.source || host(a.url), "src-link", true) : null));
  }

  // A type's approvals, newest first. Not paged, so search results that link here always land on a visible item.
  function timeline(approvals) {
    return el("div", { class: "card reveal" }, el("ol", { class: "timeline" }, approvals.map((a) => el("li", null,
      el("time", { datetime: a.date }, fmtDate(a.date)),
      el("p", null, a.drug),
      el("div", { class: "meta" }, a.text, " ", a.url ? extLink(a.url, a.source || host(a.url), "src-link", true) : null)))));
  }
  function feedLink(href, what) {
    return el("a", { class: "feed-link", href, type: "application/atom+xml", title: "Follow " + what + " in a feed reader (Atom)" }, icon("rss"), "RSS feed");
  }
  // Share and print work on prerendered pages before the data loads; hidden when JavaScript is off.
  function pageTools() {
    return el("div", { class: "page-tools js-only" },
      el("button", { type: "button", class: "tool", "data-action": "share" }, icon("share"), el("span", null, "Share")),
      el("button", { type: "button", class: "tool", "data-action": "print" }, icon("print"), el("span", null, "Print")));
  }
  function researchItem(r) {
    const pmc = pmcHref(r.pmc);
    return el("li", null, extLink(r.url, r.title, "title"),
      el("div", { class: "meta" },
        r.kind ? el("span", { class: "badge paper" }, r.kind) : null,
        r.journal ? el("span", null, r.journal) : null,
        r.date ? el("span", null, "· " + fmtDate(r.date)) : null,
        pmc ? extLink(pmc, "Free full text", "src-link", true) : null));
  }
  function trialItem(t) {
    const countries = strings(t.countries);
    const where = countries.slice(0, 3).join(", ") + (countries.length > 3 ? " +" + (countries.length - 3) + " more" : "");
    const sites = Number.isInteger(t.sites) && t.sites > 0 ? plural(t.sites, "site") : "";
    const details = [
      t.ages ? el("span", null, "Ages " + t.ages) : null,
      t.sex ? el("span", null, t.sex + " only") : null,
      countries.length ? el("span", { class: "where", title: countries.join(", ") }, icon("pin"), where + (sites ? " · " + sites : "")) : null,
    ].filter(Boolean);
    return el("li", null, extLink(t.url, t.title, "title"),
      el("div", { class: "meta" },
        prettyPhase(t.phase) ? el("span", { class: "badge phase" }, prettyPhase(t.phase)) : null,
        t.status ? el("span", { class: "badge status" }, t.status) : null,
        t.nctId ? el("span", null, t.nctId) : null,
        t.updated ? el("span", null, "· updated " + fmtDate(t.updated)) : null),
      details.length ? el("div", { class: "meta trial-details" }, details) : null);
  }

  function renderHome(v) {
    const t = totals();
    const groups = [...new Set(state.cancers.map((c) => c.group))];
    const recent = state.approvals.filter((a) => isRecent(a.date, 24));
    const stats = [
      ["grid", state.cancers.length, "cancer type explained", "cancer types explained"],
      ["sparkles", recent.length, "recent FDA approval"],
      ["book", t.papers, "new research paper"],
      ["flask", t.trials, "recruiting trial"],
    ].filter((s, i) => i !== 1 || s[1] > 0);
    if (stats.length < 4) stats.push(["news", t.news, "news story", "news stories"]);
    const parts = [
      el("div", { class: "stats" }, stats.map(([ic, n, word, many]) => el("div", { class: "stat reveal" }, icon(ic), el("b", null, n.toLocaleString("en-US")), el("span", null, noun(n, word, many))))),
      state.updates.generatedAt
        ? el("p", { class: "updated-chip" }, "Research, trials and news updated " + fmtDate(state.updates.generatedAt) + " · refreshed every Monday")
        : pendingNotice(),
      section("types", "grid", "Explore", "Explore by cancer type",
        "Symptoms, screening, treatment options, approved medicines, the newest research and recruiting trials for each type.", null,
        groups.map((g) => {
          const list = state.cancers.filter((c) => c.group === g);
          return [el("h3", { class: "group-title" }, g, el("span", { class: "count" }, list.length)), el("div", { class: "type-grid" }, list.map(typeCard))];
        })),
    ];

    if (recent.length) {
      const grid = el("div", { class: "approvals" });
      const paged = pagedList(grid, recent.map(approvalCard), 6, "data-none");
      parts.push(section("whats-new", "sparkles", "What's new", "Recent FDA approvals",
        "New medicines and new uses approved by the U.S. Food and Drug Administration, each linked to the official announcement.",
        feedLink(feedHref(), "new FDA approvals"), grid, paged.row));
    }

    const news = state.updates.news || [];
    const list = el("div", { class: "news-list" });
    const pagedNews = pagedList(list, news.map(newsItem), 10, "data-cat");
    const counts = { official: 0, research: 0, media: 0 };
    news.forEach((n) => { counts[newsCat(n)]++; });
    const opts = [["all", "All", news.length]].concat(Object.keys(CAT_LABEL).filter((k) => counts[k]).map((k) => [k, CAT_LABEL[k], counts[k]]));
    parts.push(section("news", "news", "News", "Latest cancer news",
      "Headlines from health agencies, science news services and the press. Stories are tagged by cancer type where possible.",
      opts.length > 2 ? filterBar("Filter news", opts, (f) => pagedNews.setFilter(f)) : null,
      news.length ? list : el("p", { class: "empty" }, "No news items yet."), pagedNews.row));

    const facts = (state.facts && state.facts.facts) || [];
    if (facts.length) {
      parts.push(section("facts", "chart", "By the numbers", state.facts.title || "Cancer worldwide", state.facts.intro || "", null,
        el("div", { class: "facts" }, facts.map((f) => el("div", { class: "fact reveal" },
          el("b", null, f.value), el("p", null, f.label), f.url ? extLink(f.url, f.source || host(f.url), "src-link", true) : null)))));
    }

    parts.push(section("questions", "help", "Questions", "Common questions", "Plain-language answers, each linked to the original source.", null,
      el("div", { class: "faq-grid" }, state.faq.map((f) => el("details", { class: "faq reveal", id: "faq-" + slug(f.q) },
        el("summary", null, f.q), el("p", null, f.a), extLink(f.link, "Learn more at " + host(f.link), null, true))))));

    parts.push(section("sources", "shield", "Sources", "Where the information comes from",
      "Every item links back to its original source. Automated sections are refreshed every Monday by an open-source workflow.", null,
      el("div", { class: "sources" }, SOURCES.map(([name, url, text]) => el("div", { class: "source reveal" },
        el("h3", null, extLink(url, name, null, false)), el("p", null, text))),
      el("div", { class: "source reveal" }, el("h3", null, extLink(REPO, "Open source", null, false)),
        el("p", null, "News comes from public RSS feeds" + ((state.updates.sources || {}).news ? " (" + [].concat(state.updates.sources.news).join(", ") + ")" : "") + ".")))));
    v.replaceChildren(...parts.filter(Boolean));
  }

  // ---------------------------------------------------------------- cancer type page
  function renderType(v, c) {
    const u = state.updates.byType[c.id] || {};
    const research = u.research || [];
    const trials = u.trials || [];
    const news = (state.updates.news || []).filter((n) => (n.types || []).includes(c.id));
    const approvals = (c.approvals || []).slice().sort(byDateDesc);
    const tabs = [["overview", "Overview", "activity"], ["medicines", "Medicines", "pill"],
      approvals.length ? ["approvals", "What's new", "sparkles"] : null,
      ["research", "Research", "book"], ["trials", "Trials", "flask"], ["news", "News", "news"]].filter(Boolean);
    const sec = (id, title, ic, ...content) => el("section", { class: "type-section", id, "aria-labelledby": id + "-h" },
      el("h2", { id: id + "-h" }, el("span", { class: "card-ico" }, icon(ic)), title), ...content);
    const quick = (n, word, many) => el("span", null, el("b", null, n), " " + noun(n, word, many));

    v.replaceChildren(el("article", { class: "type-page", "data-accent": c.id },
      el("header", { class: "type-header reveal" },
        el("div", { class: "header-row" },
          el("nav", { "aria-label": "Breadcrumb" }, el("ol", { class: "crumbs" },
            el("li", null, el("a", { href: "./" }, "Home")),
            el("li", null, el("a", { href: "./#types" }, c.group)),
            el("li", { "aria-current": "page" }, c.name))),
          pageTools()),
        el("div", { class: "type-title" }, el("span", { class: "type-badge" }, icon("ribbon")), el("h1", null, c.name)),
        el("p", { class: "type-summary" }, c.summary),
        c.aliases.length ? el("div", { class: "aka" }, el("span", { class: "aka-label" }, "Also searched as"), c.aliases.map((a) => el("span", null, a))) : null,
        el("div", { class: "actions" },
          extLink(c.nci, "NCI overview", "btn primary", true),
          extLink(pubmedSearch(c.query), "Search PubMed", "btn", true),
          extLink(trialsSearch(c.query), "Find recruiting trials", "btn", true),
          extLink(NCI_DRUGS, "NCI drug lists", "btn", true)),
        el("div", { class: "quick-stats" },
          quick(c.medicines.length, "medicine group"),
          approvals.length ? quick(approvals.length, "recent approval") : null,
          quick(research.length, "new paper"), quick(trials.length, "recruiting trial"), quick(news.length, "news story", "news stories"))),
      el("nav", { class: "subnav", "aria-label": "On this page" },
        el("ul", null, tabs.map(([id, label, ic]) => el("li", null, el("a", { href: typeHref(c.id, id), "data-spy": id }, icon(ic), label))))),
      sec("overview", "Overview", "activity", el("div", { class: "two-col" },
        card("Common symptoms", "activity", bullets(c.symptoms)),
        card("Risk factors", "shield", bullets(c.riskFactors)),
        card("Screening & early detection", "scan", el("p", null, c.screening),
          c.screeningSource ? el("p", { class: "meta" }, extLink(c.screeningSource.url, "Source: " + c.screeningSource.name, "src-link", true)) : null),
        card("Treatment options", "heart", bullets(c.treatments)))),
      sec("medicines", "Medicines", "pill", el("div", { class: "card reveal" },
        el("div", { class: "table-wrap" }, el("table", { class: "meds" },
          el("thead", null, el("tr", null, el("th", { scope: "col" }, "Medicine"), el("th", { scope: "col" }, "How it is used"))),
          el("tbody", null, c.medicines.map((m) => el("tr", null,
            el("td", null, m.name, m.since && isRecent(m.since, 24) ? el("span", { class: "badge new", title: "New FDA approval: " + fmtDate(m.since) }, "New") : null),
            el("td", null, m.use)))))),
        el("p", { class: "meta" }, "Examples of approved medicines, not a complete list or a recommendation. Eligibility depends on stage, biomarkers and prior treatment. ",
          extLink(NCI_DRUGS, "See NCI's drug lists")))),
      approvals.length ? sec("approvals", "What's new", "sparkles", timeline(approvals),
        el("p", { class: "meta" }, feedLink(feedHref(c.id), "new FDA approvals for " + c.name.charAt(0).toLowerCase() + c.name.slice(1)))) : null,
      sec("research", "Latest research", "book", pendingNotice(), el("div", { class: "card reveal" }, research.length
        ? [el("ul", { class: "items" }, research.map(researchItem)),
          el("p", { class: "meta" }, extLink(pubmedSearch(c.query), "More on PubMed", "src-link", true))]
        : el("p", { class: "empty" }, "No recent papers saved yet. ", extLink(pubmedSearch(c.query), "Search PubMed now")))),
      sec("trials", "Recruiting clinical trials", "flask", el("div", { class: "card reveal" }, trials.length
        ? [el("ul", { class: "items" }, trials.map(trialItem)),
          el("p", { class: "meta" }, extLink(trialsSearch(c.query), "All recruiting trials on ClinicalTrials.gov", "src-link", true))]
        : el("p", { class: "empty" }, "No trials saved yet. ", extLink(trialsSearch(c.query), "Search ClinicalTrials.gov")))),
      sec("news", "News", "news", news.length ? el("div", { class: "news-list" }, news.map(newsItem))
        : el("div", { class: "card" }, el("p", { class: "empty" }, "No recent news tagged for this cancer type. ", el("a", { href: "./#news" }, "See all cancer news")))),
      el("p", { class: "reviewed" },
        c.reviewed ? "Medicines and approvals last updated from official sources (FDA, NCI) on " + fmtDate(c.reviewed) + ". " : "",
        state.updates.generatedAt ? "Research, trials and news refreshed " + fmtDate(state.updates.generatedAt) + "." : "")));
  }

  // ---------------------------------------------------------------- search page
  // Shows the first `max` items and a "+N more" button that reveals the rest.
  function collapsible(box, items, max, noun) {
    if (items.length <= max + 1) { box.append(...items); return box; }
    box.append(...items.slice(0, max));
    const rest = items.length - max;
    const more = el("button", { type: "button", class: "tag more", "aria-label": "Show " + rest + " more " + noun }, "+" + rest + " more");
    more.addEventListener("click", () => {
      box.append(...items.slice(max));
      more.remove();
      const next = items[max];
      (next.matches("a") ? next : next.querySelector("a") || next).focus();
    });
    if (box.tagName === "UL") return [box, more];
    box.append(more);
    return box;
  }
  function resultCard(d, re, q) {
    const title = highlight(d.title, re);
    // A merged medicine or treatment links to a search for its own name; don't link back to the page we're on.
    const here = d.href === searchHref(d.title) && fold(d.title) === fold(q).trim();
    return el("article", { class: "card result", "data-kind": d.kind, "data-accent": d.types[0] || null },
      el("span", { class: "kind" }, icon(KIND_ICON[d.kind]), d.kind),
      el("h3", null, here ? title : d.href ? el("a", { class: "title", href: d.href }, title) : extLink(d.url, title, "title")),
      d.desc ? el("p", { class: "meta" }, highlight(truncate(d.desc, 240), re)) : null,
      d.uses ? collapsible(el("ul", { class: "uses" }), d.uses.map((u) => el("li", null,
        el("a", { class: "tag", href: typeHref(u.type, "medicines"), "data-accent": u.type }, state.byId[u.type].name),
        el("span", null, highlight(u.use, re)))), 3, "uses")
        : d.types.length ? collapsible(el("div"), d.types.map(typeTag).filter(Boolean), 4, "cancer types") : null,
      d.kind === "Question" && d.url ? el("div", null, extLink(d.url, "Source: " + host(d.url), "src-link", true)) : null);
  }

  function renderSearch(v, q) {
    const { results, corrected, re } = runSearch(q, false);
    setStatus(results.length ? results.length + " result" + (results.length === 1 ? "" : "s") + " for “" + q + "”" : "No results on this site for “" + q + "”.");
    const live = el("div", { class: "ext" }, el("span", { class: "meta" }, "Search live:"),
      extLink(pubmedSearch(q), "PubMed", null, true),
      extLink(trialsSearch(q), "ClinicalTrials.gov", null, true),
      extLink("https://www.cancer.gov/search/results?swKeyword=" + encodeURIComponent(q), "cancer.gov", null, true),
      extLink("https://www.who.int/home/search-results?indexCatalogue=genericsearchindex1&searchQuery=" + encodeURIComponent(q), "WHO", null, true));
    const head = el("div", { class: "search-head reveal" },
      el("h1", null, results.length ? "Results for “" + q + "”" : "No results for “" + q + "”"),
      corrected && results.length ? el("p", { class: "did-you-mean" }, "Including results for ", el("strong", null, corrected), ".") : null,
      live);
    if (!results.length) {
      v.replaceChildren(head, el("div", { class: "empty-state" },
        el("h2", null, "Try another search"),
        el("p", { class: "meta" }, "Check the spelling, use a broader term, or try one of these:"),
        el("div", { class: "filters" }, POPULAR.map((p) => el("a", { class: "filter", href: searchHref(p) }, p)))));
      return;
    }
    const counts = {};
    results.forEach((d) => { counts[d.kind] = (counts[d.kind] || 0) + 1; });
    const grid = el("div", { class: "results", id: "results" });
    const paged = pagedList(grid, results.map((d) => resultCard(d, re, q)), 24, "data-kind");
    const kinds = KINDS.filter((k) => counts[k]);
    v.replaceChildren(...[head,
      kinds.length > 1 ? el("div", { class: "filters" }, filterBar("Filter results by type", [["all", "All", results.length]].concat(kinds.map((k) => [k, k, counts[k]])), (f) => paged.setFilter(f))) : null,
      grid, paged.row].filter(Boolean));
  }

  // Words from a mistyped or outdated URL, e.g. "type/lungs/" → "lungs".
  function notFoundWords() {
    let p = location.pathname;
    if (p.startsWith(BASE.pathname)) p = p.slice(BASE.pathname.length);
    try { p = decodeURIComponent(p); } catch (_) { /* keep the raw path */ }
    return p.split(/[\/_\-.+\s]+/).filter((w) => w && !/^\d+$/.test(w) && !/^(types?|index|html?|www|php|aspx?|search)$/i.test(w)).slice(0, 6);
  }
  function notFoundSuggestions() {
    const words = notFoundWords();
    // All words first; if together they match nothing, each word on its own (without spelling corrections, which
    // would turn ordinary words like "page" into unrelated medical terms like "age").
    const queries = [words.join(" ")].concat(words.length > 1 ? words : []);
    for (let i = 0; i < queries.length; i++) {
      const s = queries[i] ? runSearch(queries[i], false) : null;
      if (!s || !s.re || (i > 0 && s.corrected)) continue;
      // Only pages whose title has a searched word: a match deep in the text is too weak to suggest.
      const inTitle = new RegExp(s.re.source + "\\b", "i");
      const hits = s.results.filter((d) => d.href && inTitle.test(d.title)).slice(0, 3);
      if (hits.length) return { q: queries[i], hits };
    }
    return null;
  }
  function renderNotFound(v) {
    setStatus("Page not found.");
    const s = notFoundSuggestions();
    v.replaceChildren(el("div", { class: "search-head empty-state reveal" },
      el("h1", null, "Page not found"),
      el("p", null, "Sorry, that page doesn't exist. It may have moved — try searching above or browse all cancer types."),
      s ? el("div", { class: "nf-suggest" },
        el("h2", null, "Were you looking for…"),
        el("ul", { class: "nf-list" }, s.hits.map((d) => el("li", { "data-accent": d.types[0] || null },
          el("a", { href: d.href }, el("span", { class: "card-ico" }, icon(KIND_ICON[d.kind])), el("span", null, d.title)),
          el("span", { class: "kind" }, d.kind)))),
        el("p", { class: "meta" }, el("a", { href: searchHref(s.q) }, "See all results for “" + s.q + "”"))) : null,
      el("div", { class: "actions" }, el("a", { class: "btn primary", href: "./" }, icon("home"), "Home page"), el("a", { class: "btn", href: "./#types" }, icon("grid"), "All cancer types"))));
  }

  // ---------------------------------------------------------------- SEO metadata
  function setHead(sel, create, attr, value) {
    let node = $(sel, doc.head);
    if (!node) { node = create(); doc.head.append(node); }
    node.setAttribute(attr, value);
  }
  const metaName = (name, value) => setHead('meta[name="' + name + '"]', () => el("meta", { name }), "content", value);
  const metaProp = (prop, value) => setHead('meta[property="' + prop + '"]', () => el("meta", { property: prop }), "content", value);

  function applyMeta(r) {
    let title = HOME_TITLE;
    let desc = HOME_DESC;
    let url = SITE;
    let robots = "index, follow, max-snippet:-1, max-image-preview:large";
    let ld;
    const website = { "@type": "WebSite", "@id": SITE + "#website", url: SITE, name: SITE_NAME, inLanguage: "en",
      description: "Searchable cancer information, treatments, medicines, clinical trials and the latest research, grouped by cancer type and refreshed weekly.",
      publisher: { "@id": SITE + "#org" } };
    const org = { "@type": "Organization", "@id": SITE + "#org", name: SITE_NAME, url: SITE, logo: SITE + "assets/icon-512.png", sameAs: [REPO] };
    const modified = state.updates.generatedAt || undefined;
    if (r.name === "home") {
      ld = [website, org,
        { "@type": "MedicalWebPage", "@id": SITE + "#webpage", url: SITE, name: title, description: desc, inLanguage: "en",
          isPartOf: { "@id": SITE + "#website" }, about: { "@type": "MedicalCondition", name: "Cancer", sameAs: "https://www.cancer.gov/about-cancer/understanding/what-is-cancer" },
          audience: { "@type": "PeopleAudience", audienceType: "Patients, caregivers and the public" }, dateModified: modified },
        { "@type": "ItemList", "@id": SITE + "#types", name: "Cancer types", numberOfItems: state.cancers.length,
          itemListElement: state.cancers.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: SITE + typeHref(c.id) })) },
        { "@type": "FAQPage", "@id": SITE + "#faq", mainEntity: state.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a, url: f.link } })) }];
    } else if (r.name === "type") {
      const c = state.byId[r.id];
      url = SITE + typeHref(c.id);
      title = c.name + ": symptoms, treatment, medicines & latest research | " + SITE_NAME;
      desc = truncate(firstSentence(c.summary) + " Symptoms, risk factors, screening, treatment options, approved medicines, new FDA approvals, recruiting trials and the latest research.", 300);
      const drugs = [...new Set(c.medicines.flatMap((m) => m.name.split(/\s*(?:\/|,|\+)\s*/))
        .map((s) => s.replace(/\s*\(.*$/, "").replace(/[()]/g, "").trim()).filter((s) => s.length > 2 && !/^chemo(therapy)?$/i.test(s)))];
      ld = [website, org,
        { "@type": "MedicalWebPage", "@id": url + "#webpage", url, name: title, description: desc, inLanguage: "en",
          isPartOf: { "@id": SITE + "#website" }, about: { "@id": url + "#condition" }, breadcrumb: { "@id": url + "#breadcrumb" },
          lastReviewed: c.reviewed || undefined, dateModified: modified,
          audience: { "@type": "PeopleAudience", audienceType: "Patients, caregivers and the public" } },
        { "@type": "MedicalCondition", "@id": url + "#condition", name: c.name, alternateName: c.aliases, description: c.summary, url, sameAs: c.nci,
          signOrSymptom: c.symptoms.map((s) => ({ "@type": "MedicalSignOrSymptom", name: s })),
          riskFactor: c.riskFactors.map((s) => ({ "@type": "MedicalRiskFactor", name: s })),
          possibleTreatment: c.treatments.map((s) => ({ "@type": "MedicalTherapy", name: s })),
          drug: drugs.map((name) => ({ "@type": "Drug", name })) },
        { "@type": "BreadcrumbList", "@id": url + "#breadcrumb", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE },
          { "@type": "ListItem", position: 2, name: c.name, item: url }] }];
    } else if (r.name === "search") {
      url = SITE + searchHref(r.q).slice(2);
      title = "“" + r.q + "” – search | " + SITE_NAME;
      desc = "Search results for “" + r.q + "” across cancer types, medicines, treatments, approvals, questions, research, trials and news.";
      robots = "noindex, follow";
      ld = [website, org];
    } else {
      title = "Page not found | " + SITE_NAME;
      robots = "noindex, follow";
      ld = [website, org];
    }
    doc.title = title;
    metaName("description", desc);
    metaName("robots", robots);
    const known = r.name === "home" || r.name === "type" || r.name === "search";
    if (known) setHead('link[rel="canonical"]', () => el("link", { rel: "canonical" }), "href", url);
    else { const canonical = $('link[rel="canonical"]', doc.head); if (canonical) canonical.remove(); }
    // Each type page also advertises its own approvals feed; the site-wide feed link is static in index.html.
    const typeFeed = $('link[rel="alternate"][data-feed="type"]', doc.head);
    if (r.name === "type") {
      const c = state.byId[r.id];
      setHead('link[rel="alternate"][data-feed="type"]', () => el("link", { rel: "alternate", type: "application/atom+xml", "data-feed": "type" }), "href", SITE + feedHref(c.id));
      $('link[data-feed="type"]', doc.head).setAttribute("title", c.name + " – new FDA approvals | " + SITE_NAME);
    } else if (typeFeed) typeFeed.remove();
    metaProp("og:title", title);
    metaProp("og:description", desc);
    metaProp("og:url", url);
    metaProp("og:type", r.name === "type" ? "article" : "website");
    metaName("twitter:title", title);
    metaName("twitter:description", desc);
    const json = JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c");
    setHead("#ld-json", () => el("script", { type: "application/ld+json", id: "ld-json" }), "type", "application/ld+json");
    $("#ld-json").textContent = json;
  }

  // ---------------------------------------------------------------- chrome (hero, nav)
  function heroText() {
    return el("div", { id: "hero-text", class: "hero-text" },
      el("p", { class: "eyebrow" }, "Free · Open source · Updated every week"),
      el("h1", { class: "hero-title" }, "Cancer information from trusted sources, ", el("span", { class: "grad" }, "updated every week.")),
      el("p", { class: "tagline" }, "Search symptoms, treatments, approved medicines, recruiting clinical trials and new research for " + state.cancers.length + " cancer types — sourced from NCI, FDA, WHO, PubMed and ClinicalTrials.gov."));
  }

  function updateChrome(r, initial) {
    const home = r.name === "home";
    const hero = $("#hero");
    const existing = $("#hero-text");
    if (home) {
      hero.removeAttribute("data-compact");
      const fresh = heroText();
      if (existing) existing.replaceWith(fresh); else $(".hero-inner", hero).prepend(fresh);
    } else {
      hero.setAttribute("data-compact", "");
      if (existing) existing.remove();
    }
    const extra = $("#hero-extra");
    extra.replaceChildren();
    if (home) extra.append(el("span", { class: "label" }, "Popular:"), ...POPULAR.map((p) => el("a", { class: "pill-link", href: searchHref(p) }, p)));
    const nav = $("#type-nav");
    nav.hidden = home;
    nav.replaceChildren();
    if (!home) {
      nav.append(el("a", { class: "chip", href: "./#types" }, icon("grid"), "All types"));
      for (const g of [...new Set(state.cancers.map((c) => c.group))]) {
        nav.append(el("span", { class: "chip-group" }, g));
        for (const c of state.cancers.filter((x) => x.group === g)) {
          nav.append(el("a", { class: "chip", href: typeHref(c.id), "aria-current": r.id === c.id ? "page" : null }, shortName(c)));
        }
      }
    }
    $(".skip").setAttribute("href", routePath() + "#main");
    // Keep anything typed into the prerendered search box while the data was loading.
    const input = $("#q");
    if (!initial || !input.value) input.value = r.name === "search" ? r.q : "";
  }

  // ---------------------------------------------------------------- routing
  function routePath() {
    const p = location.pathname;
    return p.startsWith(BASE.pathname) ? p.slice(BASE.pathname.length) || "./" : "./";
  }
  function currentRoute() {
    const bp = BASE.pathname;
    const p = location.pathname;
    if (!p.startsWith(bp) && p + "/" !== bp) return { name: "404" };
    const rel = p.slice(bp.length).replace(/(^|\/)index\.html$/, "$1").replace(/\/+$/, "");
    const q = (new URLSearchParams(location.search).get("q") || "").trim();
    if (rel === "") return q ? { name: "search", q } : { name: "home" };
    const m = rel.match(/^type\/([a-z0-9-]+)$/);
    if (m && state.byId[m[1]]) return { name: "type", id: m[1] };
    return { name: "404" };
  }
  function migrateLegacyHash() {
    const h = location.hash;
    let m;
    try {
      if ((m = h.match(/^#\/type\/([^/?#]+)/))) history.replaceState(null, "", typeHref(decodeURIComponent(m[1])));
      else if ((m = h.match(/^#\/search\/(.*)$/))) history.replaceState(null, "", searchHref(decodeURIComponent(m[1])));
      else if (h === "#/") history.replaceState(null, "", "./");
    } catch (_) { /* malformed legacy URL: fall through to the normal route */ }
  }
  const pageKey = () => location.pathname + location.search;

  function render(opts) {
    opts = opts || {};
    const r = currentRoute();
    state.route = r;
    state.key = pageKey();
    closeSuggestions();
    const v = $("#view");
    v.classList.toggle("animate", !!opts.animate);
    setStatus("");
    if (r.name === "home") renderHome(v);
    else if (r.name === "type") renderType(v, state.byId[r.id]);
    else if (r.name === "search") renderSearch(v, r.q);
    else renderNotFound(v);
    updateChrome(r, opts.initial);
    applyMeta(r);
    setupSpy();
    root.removeAttribute("data-pending");
    const target = location.hash.length > 1 && doc.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      if (target.tagName === "DETAILS") target.open = true;
      target.scrollIntoView();
    } else if (typeof opts.y === "number") window.scrollTo(0, opts.y);
    if (opts.focus) {
      const h = $("#view h1") || $("#main");
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }

  function navigate(href, opts) {
    opts = opts || {};
    const url = new URL(href, BASE);
    try { history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), ""); } catch (_) { /* ignore */ }
    const same = url.pathname + url.search === pageKey();
    history[opts.replace || same ? "replaceState" : "pushState"]({ y: 0 }, "", url.href);
    render({ animate: true, y: 0, focus: opts.focus });
  }

  function onLinkClick(e) {
    // Until the data has loaded, links do a normal navigation to the prerendered page.
    if (!state.ready || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(BASE.pathname)) return;
    if (/\.(?!html?$)[a-z0-9]+$/i.test(url.pathname)) return; // files such as sitemap.xml
    if (url.pathname + url.search === pageKey()) {
      if (url.hash) {
        const t = doc.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (t && t.tagName === "DETAILS") t.open = true;
        return; // same-page anchor: let the browser scroll
      }
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    e.preventDefault();
    navigate(url.href, { focus: true });
  }

  // ---------------------------------------------------------------- typeahead
  let pendingSearch = null; // a search submitted before the data loaded
  let sugItems = [];
  let sugIndex = -1;
  let sugTimer = 0;
  function closeSuggestions() {
    const list = $("#suggestions");
    const input = $("#q");
    clearTimeout(sugTimer);
    sugItems = [];
    sugIndex = -1;
    if (!list) return;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function updateSuggestions() {
    const input = $("#q");
    const list = $("#suggestions");
    const q = input.value.trim();
    if (!state.ready || q.length < 2 || doc.activeElement !== input) return closeSuggestions();
    const { results, re } = runSearch(q, true);
    const internal = [];
    const seen = new Set();
    for (const d of results) {
      if (!d.href || seen.has(d.kind + d.title)) continue;
      seen.add(d.kind + d.title);
      internal.push({ d });
      if (internal.length === 6) break;
    }
    sugItems = internal.concat([{ all: true, q, count: results.length }]);
    list.replaceChildren(...sugItems.map((it, i) => {
      const li = el("li", { id: "sug-" + i, role: "option", "aria-selected": "false", "data-i": i, class: it.all ? "sug-all" : null,
        "data-accent": it.d ? it.d.types[0] || null : null });
      if (it.all) {
        li.append(el("span", { class: "sug-ico" }, icon("search")),
          el("span", { class: "sug-main" }, el("span", { class: "sug-title" }, "Search all for “" + q + "”"),
            el("span", { class: "sug-sub" }, it.count ? plural(it.count, "result") + " on this site" : "Search trusted sources")));
      } else {
        const d = it.d;
        const sub = d.kind === "Cancer type" ? d.desc : d.types.length > 1 ? d.types.length + " cancer types"
          : d.types.length ? (state.byId[d.types[0]] || {}).name : d.desc;
        li.append(el("span", { class: "sug-ico" }, icon(KIND_ICON[d.kind])),
          el("span", { class: "sug-main" }, el("span", { class: "sug-title" }, highlight(d.title, re)), sub ? el("span", { class: "sug-sub" }, sub) : null),
          el("span", { class: "sug-kind" }, d.kind));
      }
      return li;
    }));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    sugIndex = -1;
    input.removeAttribute("aria-activedescendant");
  }
  function moveSuggestion(delta) {
    if (!sugItems.length) return;
    sugIndex = (sugIndex + delta + sugItems.length + 1) % (sugItems.length + 1);
    if (sugIndex === sugItems.length) sugIndex = -1;
    $$("#suggestions li").forEach((li, i) => li.setAttribute("aria-selected", i === sugIndex ? "true" : "false"));
    const input = $("#q");
    if (sugIndex >= 0) {
      input.setAttribute("aria-activedescendant", "sug-" + sugIndex);
      $("#sug-" + sugIndex).scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function chooseSuggestion(i) {
    const it = sugItems[i];
    if (!it) return;
    const input = $("#q");
    closeSuggestions();
    if (it.all) navigate(searchHref(it.q));
    else { input.value = ""; navigate(it.d.href, { focus: true }); }
    if (coarsePointer()) input.blur();
  }
  const reducedMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = () => window.matchMedia && matchMedia("(pointer: coarse)").matches;

  // ---------------------------------------------------------------- scroll effects
  let spy = null;
  function setupSpy() {
    if (spy) { spy.disconnect(); spy = null; }
    const links = $$(".subnav a[data-spy]");
    if (!links.length || !("IntersectionObserver" in window)) return;
    const visible = new Map();
    spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting));
      const active = links.find((a) => visible.get(a.getAttribute("data-spy"))) || null;
      links.forEach((a) => a.setAttribute("aria-current", a === active ? "true" : "false"));
      if (active) {
        const ul = active.closest("ul");
        const left = active.offsetLeft - 16;
        if (ul && (left < ul.scrollLeft || active.offsetLeft + active.offsetWidth > ul.scrollLeft + ul.clientWidth)) ul.scrollTo({ left, behavior: "smooth" });
      }
    }, { rootMargin: "-140px 0px -50% 0px" });
    links.forEach((a) => { const s = doc.getElementById(a.getAttribute("data-spy")); if (s) spy.observe(s); });
  }
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      $("#topbar").classList.toggle("scrolled", y > 8);
      $("#to-top").hidden = y < 900;
    });
  }

  // ---------------------------------------------------------------- theme
  function themeNow() {
    return root.getAttribute("data-theme") || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncThemeButton() {
    $("#theme-toggle").setAttribute("aria-label", themeNow() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  // ---------------------------------------------------------------- share & print
  let copiedTimer = 0;
  async function sharePage(button) {
    const canonical = $('link[rel="canonical"]', doc.head);
    const url = (canonical && canonical.href) || location.href;
    if (navigator.share) {
      try { await navigator.share({ title: doc.title, url }); return; }
      catch (err) { if (err && err.name === "AbortError") return; } // otherwise copy the link instead
    }
    try {
      await navigator.clipboard.writeText(url);
      const label = $("span", button);
      label.textContent = "Link copied";
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { label.textContent = "Share"; }, 2500);
      setStatus("Link copied to clipboard.", false);
    } catch (_) {
      setStatus("Copy this link: " + url, true);
    }
  }
  function onToolClick(e) {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    if (b.getAttribute("data-action") === "share") sharePage(b);
    else if (b.getAttribute("data-action") === "print") window.print();
  }

  // ---------------------------------------------------------------- init
  function submitSearch(q) {
    navigate(q ? searchHref(q) : "./");
    if (coarsePointer()) $("#q").blur();
  }

  function bindUI() {
    const input = $("#q");
    const list = $("#suggestions");
    const fullPlaceholder = input.placeholder;
    const narrow = window.matchMedia && matchMedia("(max-width: 520px)");
    const fitPlaceholder = () => { input.placeholder = narrow && narrow.matches ? "Cancer, drug, symptom…" : fullPlaceholder; };
    if (narrow) { fitPlaceholder(); narrow.addEventListener("change", fitPlaceholder); }
    doc.addEventListener("click", onLinkClick);
    doc.addEventListener("click", onToolClick);
    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      closeSuggestions();
      if (!state.ready) { pendingSearch = q; return; }
      submitSearch(q);
    });
    input.addEventListener("input", () => { clearTimeout(sugTimer); sugTimer = setTimeout(updateSuggestions, 60); });
    input.addEventListener("focus", () => { if (input.value.trim().length >= 2) updateSuggestions(); });
    input.addEventListener("blur", () => setTimeout(() => { if (doc.activeElement !== input) closeSuggestions(); }, 120));
    input.addEventListener("keydown", (e) => {
      const open = !list.hidden;
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) updateSuggestions(); else moveSuggestion(1); }
      else if (e.key === "ArrowUp") { if (open) { e.preventDefault(); moveSuggestion(-1); } }
      else if (e.key === "Enter" && open && sugIndex >= 0) { e.preventDefault(); chooseSuggestion(sugIndex); }
      else if (e.key === "Escape") { if (open) { e.preventDefault(); closeSuggestions(); } }
    });
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) chooseSuggestion(Number(li.getAttribute("data-i")));
    });
    doc.addEventListener("keydown", (e) => {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
    $("#search-jump").addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      input.focus({ preventScroll: true });
    });
    $("#to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }));
    $(".skip").addEventListener("click", (e) => {
      e.preventDefault();
      const main = $("#main");
      main.focus({ preventScroll: true });
      main.scrollIntoView();
    });
    $("#theme-toggle").addEventListener("click", () => {
      const next = themeNow() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (_) { /* storage unavailable */ }
      syncThemeButton();
    });
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeButton);
    syncThemeButton();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", (e) => {
      if (!state.ready) return;
      migrateLegacyHash(); // an old #/type/... link opened on a page that is already showing
      const y = e.state && typeof e.state.y === "number" ? e.state.y : 0;
      if (pageKey() === state.key) {
        const t = location.hash.length > 1 && doc.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (t) t.scrollIntoView(); else window.scrollTo(0, y);
        return;
      }
      render({ y });
    });
    onScroll();
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + ": HTTP " + res.status);
    return res.json();
  }

  async function init() {
    migrateLegacyHash();
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    bindUI();
    const prerendered = !!$("#view > :not(noscript)");
    if (!prerendered) {
      setStatus("Loading…", true);
      $("#view").append(el("div", { class: "skeleton", "aria-hidden": "true" }, [1, 2, 3, 4, 5, 6].map(() => el("div"))));
    }
    try {
      const [cancers, faq, updates, facts] = await Promise.all([
        loadJSON("data/cancers.json"), loadJSON("data/faq.json"),
        loadJSON("data/updates.json").catch(() => null), loadJSON("data/facts.json").catch(() => null)]);
      state.cancers = cancers;
      state.faq = faq;
      state.facts = facts;
      state.updates = Object.assign({ byType: {}, news: [] }, updates || {});
      state.updates.byType = state.updates.byType || {};
      state.byId = Object.assign(Object.create(null), Object.fromEntries(cancers.map((c) => [c.id, c])));
      // An approval can matter to several types (e.g. a leukemia drug approved for children); list it once.
      const approvals = new Map();
      for (const c of cancers) {
        for (const a of c.approvals || []) {
          const key = a.url || a.date + " " + fold(a.drug);
          if (approvals.has(key)) approvals.get(key).types.push(c.id);
          else approvals.set(key, Object.assign({ types: [c.id] }, a));
        }
      }
      state.approvals = [...approvals.values()].sort(byDateDesc);
      buildIndex();
    } catch (err) {
      // Keep prerendered content readable; its links still work as normal page loads.
      if (!prerendered) $("#view").replaceChildren();
      setStatus("Could not load data: " + err.message, true);
      root.removeAttribute("data-pending");
      root.setAttribute("data-error", "");
      return;
    }
    state.ready = true;
    if (state.updates.generatedAt) $("#updated").textContent = "Last updated " + fmtDate(state.updates.generatedAt) + ".";
    // The "What's new" section only exists while there are recent approvals.
    const newLink = $('.toplinks a[href$="#whats-new"]');
    if (newLink) newLink.hidden = !state.approvals.some((a) => isRecent(a.date, 24));
    render({ y: history.state && typeof history.state.y === "number" ? history.state.y : undefined, initial: true });
    if (pendingSearch !== null) submitSearch(pendingSearch);
    else if ($("#q") === doc.activeElement) updateSuggestions();
    pendingSearch = null;
    root.setAttribute("data-ready", "");
  }

  init();
})();
