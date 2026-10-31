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
  const refs = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map((m) => m[1]);
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

function setup({ observer } = {}) {
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
    querySelectorAll: (selector) => (selector === ".reveal" ? reveals : []),
    getElementById: (id) => panels[id] || null,
  };
  vm.runInNewContext(script, { window, document, IntersectionObserver: window.IntersectionObserver });
  return { tabs, panels, nodes, reveals, observers };
}

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
