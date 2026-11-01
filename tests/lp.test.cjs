const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const LINE_URL = "https://lin.ee/RuumZrp";

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

test("LINEの問い合わせ導線がすべて同じURLを新しいタブで開く", () => {
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => attributes(m[0]));
  const lineLinks = anchors.filter((a) => a.href && a.href.includes("lin.ee"));
  assert.ok(lineLinks.length >= 5, "ヘッダー・ヒーロー・最終CTA・固定ボタン・フッターに置く");
  for (const link of lineLinks) {
    assert.equal(link.href, LINE_URL);
    assert.equal(link.target, "_blank");
    assert.match(link.rel, /noopener/);
  }
  const placements = lineLinks.map((a) => a["data-line-cta"]).filter(Boolean);
  for (const place of ["header", "hero", "final", "sticky"]) assert.ok(placements.includes(place), place);
});

test("フォームと送信APIへの依存が残っていない", () => {
  assert.doesNotMatch(html, /<form\b/);
  assert.doesNotMatch(html, /\/api\//);
  assert.ok(!fs.existsSync(path.join(root, "api", "demo.js")));
});

test("ページ内で参照するローカル画像・ファイルがすべて存在する", () => {
  const refs = [...html.matchAll(/(?:src|href|srcset)="\.\/([^"#?]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const ref of new Set(refs)) {
    assert.ok(fs.existsSync(path.join(root, ref)), `${ref} がない`);
  }
  const og = html.match(/property="og:image" content="https:\/\/hokokukakumei\.com\/([^"]+)"/)[1];
  assert.ok(fs.existsSync(path.join(root, og)), og);
});

test("見出し・画像・ページ内リンクの構造が保たれている", () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(img[0], /\balt="/, `alt がない: ${img[0].slice(0, 80)}`);
    assert.match(img[0], /\bwidth="\d+"\s+height="\d+"/, `寸法がない: ${img[0].slice(0, 80)}`);
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const hash of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(hash[1]), `#${hash[1]} の行き先がない`);
  for (const use of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(ids.has(use[1]), `#${use[1]} のアイコンがない`);
});

test("構造化データが料金と問い合わせ先に一致する", () => {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const graph = JSON.parse(json)["@graph"];
  const software = graph.find((item) => item["@type"] === "SoftwareApplication");
  const organization = graph.find((item) => item["@type"] === "Organization");
  assert.equal(software.offers.price, "550");
  assert.equal(software.offers.priceCurrency, "JPY");
  assert.match(software.operatingSystem, /iOS/);
  assert.match(software.operatingSystem, /Android/);
  assert.equal(organization.contactPoint.url, LINE_URL);
  assert.match(html, /550<\/b>/);
});

test("業種タブとパネルが対応し、最初のパネルだけ表示する", () => {
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map((m) => attributes(m[0]));
  assert.equal(tabs.length, 6);
  tabs.forEach((tab, index) => {
    const panel = html.match(new RegExp(`<div class="case-panel" id="${tab["aria-controls"]}"[^>]*>`));
    assert.ok(panel, tab["aria-controls"]);
    assert.equal(/\bhidden\b/.test(panel[0]), index !== 0);
    assert.equal(tab["aria-selected"], String(index === 0));
  });
});

// script.js をそのまま実行するための最小限のDOM。
class FakeElement {
  constructor(attrs = {}) {
    this.attrs = new Map(Object.entries(attrs));
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this.classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classes.delete(n)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force = !this.classes.has(name)) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      },
    };
    this.hidden = false;
    this.tabIndex = 0;
    this.focused = false;
    this.children = [];
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }
  fire(type, extra = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    (this.listeners[type] || []).forEach((handler) => handler(event));
    return event;
  }
  querySelectorAll(selector) {
    return selector === '[role="tab"]' ? this.children : [];
  }
  focus() {
    this.focused = true;
  }
  scrollIntoView() {}
}

function setup({ observer, search = "", sessionStorage, va } = {}) {
  const names = ["seitai", "nail", "hair"];
  const tabs = names.map((name, i) => new FakeElement({ role: "tab", "aria-controls": `case-${name}`, "aria-selected": String(i === 0) }));
  const panels = Object.fromEntries(names.map((name, i) => {
    const panel = new FakeElement({ id: `case-${name}` });
    panel.hidden = i !== 0;
    return [`case-${name}`, panel];
  }));
  const tabList = new FakeElement();
  tabList.children = tabs;
  const reveals = [new FakeElement(), new FakeElement()];
  const lineLinks = ["hero", "sticky"].map((place) => new FakeElement({ "data-line-cta": place }));
  const nodes = {
    "[data-header]": new FakeElement(),
    "[data-mobile-cta]": new FakeElement(),
    "[data-hero-cta]": new FakeElement(),
    "[data-final-cta]": new FakeElement(),
    "[data-case-tabs]": tabList,
  };
  const observers = [];
  const window = {
    scrollY: 0,
    addEventListener() {},
    location: { search },
    sessionStorage,
    va,
  };
  if (observer) {
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observers.push(this);
      }
      observe(target) {
        this.targets.push(target);
      }
      unobserve() {}
      emit(entries) {
        this.callback(entries.map(([target, isIntersecting]) => ({ target, isIntersecting })));
      }
    };
  }
  const document = {
    querySelector: (selector) => nodes[selector] || null,
    querySelectorAll: (selector) => ({ ".reveal": reveals, "[data-line-cta]": lineLinks })[selector] || [],
    getElementById: (id) => panels[id] || null,
  };
  vm.runInNewContext(script, { window, document, IntersectionObserver: window.IntersectionObserver, URLSearchParams });
  return { tabs, panels, nodes, reveals, observers, lineLinks };
}

function recorder() {
  const events = [];
  // vm 側で作ったオブジェクトはプロトタイプが違うので、JSONで写してから比べる。
  return { events, va: (type, payload) => events.push(JSON.parse(JSON.stringify([type, payload]))) };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test("アクセス解析は、LPとブログの両方でスタブ→解析スクリプト→script.jsの順に読み込む", () => {
  const { renderMessagePage } = require("../api/_lib/blog/pages");
  const blog = renderMessagePage({ title: "テスト", message: "テスト" });
  for (const [name, page, own] of [["LP", html, "./script.js"], ["ブログ", blog, "/script.js"]]) {
    const stub = page.indexOf("window.va = window.va ||");
    const insights = page.indexOf('<script src="/_vercel/insights/script.js" defer></script>');
    const main = page.indexOf(`<script src="${own}" defer></script>`);
    assert.ok(stub > 0 && insights > stub && main > insights, name);
  }
});

test("utm_source 付きで来たら流入を送り、同じタブのLINEクリックに流入元と場所を付ける", () => {
  const { events, va } = recorder();
  const storage = memoryStorage();
  const { lineLinks } = setup({ search: "?utm_source=note&utm_medium=referral&utm_campaign=intro_202611", sessionStorage: storage, va });
  assert.deepEqual(events, [["event", { name: "UTM Landing", data: { source: "note", campaign: "intro_202611" } }]]);
  assert.equal(storage.data.get("hk-source"), "note");

  lineLinks[1].fire("click");
  assert.deepEqual(events[1], ["event", { name: "LINE Click", data: { position: "sticky", source: "note" } }]);

  // 別のページに移っても、同じタブなら流入元を覚えている。流入イベントは二重に送らない。
  const next = recorder();
  const again = setup({ sessionStorage: storage, va: next.va });
  again.lineLinks[0].fire("click");
  assert.deepEqual(next.events, [["event", { name: "LINE Click", data: { position: "hero", source: "note" } }]]);
});

test("UTMなし・sessionStorageが使えない・解析スクリプトがない環境でも動く", () => {
  const { events, va } = recorder();
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const { lineLinks } = setup({ search: "?utm_source=instagram", sessionStorage: blocked, va });
  lineLinks[0].fire("click");
  assert.deepEqual(events.map(([, e]) => [e.name, e.data.source]), [["UTM Landing", "instagram"], ["LINE Click", "instagram"]]);

  const plain = recorder();
  setup({ va: plain.va }).lineLinks[0].fire("click");
  assert.deepEqual(plain.events, [["event", { name: "LINE Click", data: { position: "hero", source: "(none)" } }]]);

  assert.doesNotThrow(() => setup({ search: "?utm_source=note" }).lineLinks[0].fire("click"));
});

test("タブのクリックと矢印キーで表示する業種が切り替わる", () => {
  const { tabs, panels } = setup();
  tabs[1].fire("click");
  assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(tabs[0].getAttribute("aria-selected"), "false");
  assert.equal(panels["case-nail"].hidden, false);
  assert.equal(panels["case-seitai"].hidden, true);
  assert.equal(tabs[0].tabIndex, -1);

  const event = tabs[1].fire("keydown", { key: "ArrowRight" });
  assert.ok(event.defaultPrevented);
  assert.equal(panels["case-hair"].hidden, false);
  assert.ok(tabs[2].focused);

  tabs[2].fire("keydown", { key: "ArrowRight" });
  assert.equal(panels["case-seitai"].hidden, false, "最後から先頭へ戻る");
  tabs[0].fire("keydown", { key: "End" });
  assert.equal(panels["case-hair"].hidden, false);
});

test("IntersectionObserver がない環境でも内容と固定ボタンを表示する", () => {
  const { reveals, nodes } = setup();
  assert.ok(reveals.every((el) => el.classes.has("is-in")));
  assert.ok(nodes["[data-mobile-cta]"].classes.has("is-visible"));
});

test("固定のLINEボタンはヒーローと最後のCTAが見えない間だけ出す", () => {
  const { observers, nodes } = setup({ observer: true });
  const cta = nodes["[data-mobile-cta]"];
  const ctaObserver = observers.find((o) => o.targets.includes(nodes["[data-hero-cta]"]));
  assert.ok(ctaObserver);
  assert.equal(cta.classes.has("is-visible"), false);
  ctaObserver.emit([[nodes["[data-hero-cta]"], false]]);
  assert.equal(cta.classes.has("is-visible"), true);
  ctaObserver.emit([[nodes["[data-final-cta]"], true]]);
  assert.equal(cta.classes.has("is-visible"), false);
  ctaObserver.emit([[nodes["[data-final-cta]"], false]]);
  assert.equal(cta.classes.has("is-visible"), true);
  ctaObserver.emit([[nodes["[data-hero-cta]"], true]]);
  assert.equal(cta.classes.has("is-visible"), false);
});
