const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");

// The production script runs unchanged. This small DOM substitute only provides
// browser events, form values, attributes, and animation observation boundaries.
class Element {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, enabled = !this.classes.has(name)) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
        return enabled;
      },
    };
    this.textContent = "";
    this.disabled = false;
    this.hidden = false;
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  async dispatch(type, details = {}) {
    const event = { preventDefault() { this.defaultPrevented = true; }, ...details };
    await Promise.all((this.listeners.get(type) || []).map((handler) => handler(event)));
    return event;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(element) { return element === this; }
}

const initialValues = [
  ["entry.76457101", "検証用会社（外部送信なし）"],
  ["entry.853312219", "確認担当"],
  ["entry.121044799", "000-0000-0000"],
  ["entry.1490888909", "test@example.invalid"],
  ["entry.749671614", ""],
];

function setup(fetch, { reducedMotion = false, observerFails = false, noObserver = false } = {}) {
  const form = new Element({ action: "/api/demo" });
  form.values = new Map(initialValues);
  form.resets = 0;
  form.reset = () => {
    form.resets += 1;
    form.values = new Map(initialValues.map(([key]) => [key, ""]));
  };
  const status = new Element();
  const button = new Element();
  const root = new Element();
  const toggle = new Element();
  toggle.hidden = true;
  const cta = new Element();
  const reveal = new Element();
  const preference = new Element();
  preference.matches = reducedMotion;
  const elements = new Map([
    [".demo-form", form], [".form-status", status], [".form-submit", button],
    ["[data-motion-toggle]", toggle], [".mobile-cta", cta],
  ]);
  const document = {
    documentElement: root,
    activeElement: null,
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: (selector) => selector === "[data-reveal]" ? [reveal] : [],
  };
  const timers = new Map();
  let nextTimer = 0;
  const observers = [];
  class Observer {
    constructor(callback) {
      if (observerFails) throw new Error("Observation is unavailable");
      this.callback = callback;
      this.targets = new Set();
      observers.push(this);
    }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
  }
  const window = {
    matchMedia: () => preference,
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  if (!noObserver) window.IntersectionObserver = Observer;
  vm.runInNewContext(source, {
    document, window, fetch, AbortController, URLSearchParams,
    FormData: class {
      constructor(target) { this.entries = [...target.values]; }
      [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
    },
  }, { filename: "script.js" });

  return {
    form, status, button, root, toggle, cta, reveal, preference, document, observers, timers,
    submit: () => form.dispatch("submit"),
    runTimer(delay) {
      for (const [id, timer] of timers) {
        if (timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

const success = () => ({ ok: true, json: async () => ({ ok: true }) });

test("submits the existing URL-encoded field contract and clears only a confirmed success", async () => {
  const requests = [];
  const page = setup(async (url, options) => {
    requests.push({ url, options });
    assert.equal(page.button.disabled, true);
    assert.equal(page.form.getAttribute("aria-busy"), "true");
    return success();
  });
  const event = await page.submit();
  assert.equal(event.defaultPrevented, true);
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, "/api/demo");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded;charset=UTF-8");
  assert.deepEqual([...options.body], initialValues);
  assert.equal(page.form.resets, 1);
  assert.equal(page.status.classList.contains("is-success"), true);
  assert.match(page.status.textContent, /お申し込みありがとうございます/);
  assert.equal(page.status.getAttribute("aria-live"), "polite");
  assert.equal(page.button.disabled, false);
  assert.equal(page.form.getAttribute("aria-busy"), "false");
  assert.equal(page.timers.size, 0);
});

test("HTTP errors, unconfirmed JSON, invalid JSON, and network failures retain input and allow retry", async (t) => {
  for (const [name, fail] of [
    ["400", async () => ({ ok: false, status: 400 })],
    ["502", async () => ({ ok: false, status: 502 })],
    ["ok false", async () => ({ ok: true, json: async () => ({ ok: false }) })],
    ["missing ok", async () => ({ ok: true, json: async () => ({}) })],
    ["invalid JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError(); } })],
    ["network failure", async () => { throw new TypeError("Network failure"); }],
  ]) {
    await t.test(name, async () => {
      let attempts = 0;
      const page = setup(async () => ++attempts === 1 ? fail() : success());
      await page.submit();
      assert.equal(page.form.resets, 0);
      assert.deepEqual([...page.form.values], initialValues);
      assert.equal(page.status.classList.contains("is-error"), true);
      assert.match(page.status.textContent, /入力内容は残っています/);
      assert.equal(page.button.disabled, false);
      assert.equal(page.form.getAttribute("aria-busy"), "false");
      assert.equal(page.timers.size, 0);
      await page.submit();
      assert.equal(attempts, 2);
      assert.equal(page.form.resets, 1);
      assert.equal(page.status.classList.contains("is-error"), false);
      assert.equal(page.status.classList.contains("is-success"), true);
    });
  }
});

test("a second submit event cannot create a duplicate request while the first is pending", async () => {
  let calls = 0;
  let finish;
  const page = setup(() => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = page.submit();
  const second = await page.submit();
  assert.equal(second.defaultPrevented, true);
  assert.equal(calls, 1);
  assert.equal(page.button.disabled, true);
  finish(success());
  await first;
  assert.equal(page.button.disabled, false);
  assert.equal(page.form.resets, 1);
});

test("a 15-second timeout aborts the request, retains input, and permits a later retry", async () => {
  let attempts = 0;
  let pendingSignal;
  const page = setup(async (_url, { signal }) => {
    attempts += 1;
    if (attempts > 1) return success();
    pendingSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    });
  });
  const pending = page.submit();
  assert.equal(page.button.disabled, true);
  page.runTimer(15000);
  await pending;
  assert.equal(pendingSignal.aborted, true);
  assert.equal(page.form.resets, 0);
  assert.deepEqual([...page.form.values], initialValues);
  assert.match(page.status.textContent, /送信の確認に時間がかかっています/);
  assert.equal(page.button.disabled, false);
  assert.equal(page.timers.size, 0);
  await page.submit();
  assert.equal(attempts, 2);
  assert.equal(page.form.resets, 1);
});

test("reduced motion starts paused, reveals content, and follows the control and system preference", async () => {
  const page = setup(async () => success(), { reducedMotion: true });
  assert.equal(page.root.classList.contains("motion-paused"), true);
  assert.equal(page.reveal.classList.contains("is-visible"), true);
  assert.equal(page.toggle.hidden, false);
  assert.equal(page.toggle.getAttribute("aria-pressed"), "true");
  assert.equal(page.toggle.textContent, "動きを再開");
  await page.toggle.dispatch("click");
  assert.equal(page.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(page.toggle.textContent, "動きを止める");
  await page.preference.dispatch("change", { matches: true });
  assert.equal(page.root.classList.contains("motion-paused"), true);
  await page.preference.dispatch("change", { matches: false });
  assert.equal(page.root.classList.contains("motion-paused"), false);
});

test("unsupported or failed observation keeps content visible and the form working", async (t) => {
  for (const options of [{ noObserver: true }, { observerFails: true }]) {
    await t.test(JSON.stringify(options), async () => {
      const page = setup(async () => success(), options);
      assert.equal(page.root.classList.contains("motion-ready"), false);
      assert.equal(page.reveal.classList.contains("is-visible"), true);
      await page.submit();
      assert.equal(page.form.resets, 1);
    });
  }
});

test("the mobile CTA hides at the form without hiding the currently focused CTA", async () => {
  const page = setup(async () => success());
  const observer = page.observers.find((item) => item.targets.has(page.form));
  page.document.activeElement = page.cta;
  observer.callback([{ target: page.form, isIntersecting: true }]);
  assert.equal(page.cta.classList.contains("is-hidden"), false);
  page.document.activeElement = page.form;
  await page.cta.dispatch("focusout");
  page.runTimer(0);
  assert.equal(page.cta.classList.contains("is-hidden"), true);
  assert.equal(page.cta.getAttribute("aria-hidden"), "true");
  assert.equal(page.cta.getAttribute("inert"), "");
  observer.callback([{ target: page.form, isIntersecting: false }]);
  assert.equal(page.cta.classList.contains("is-hidden"), false);
  assert.equal(page.cta.getAttribute("aria-hidden"), null);
  assert.equal(page.cta.getAttribute("inert"), null);
});
