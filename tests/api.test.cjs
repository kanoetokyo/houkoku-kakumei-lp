const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../api/demo.js"), "utf8");
const fields = {
  "entry.76457101": "検証用会社（外部送信なし）",
  "entry.853312219": "確認担当",
  "entry.121044799": "000-0000-0000",
  "entry.1490888909": "test@example.invalid",
  "entry.749671614": "20",
};

function loadHandler(fetch) {
  const module = { exports: {} };
  // No real network implementation is exposed to the production handler.
  vm.runInNewContext(source, {
    module, fetch, URLSearchParams, Buffer, console: { error() {} },
  }, { filename: "api/demo.js" });
  return module.exports;
}

async function request(handler, { method = "POST", body = fields, stream } = {}) {
  const req = { method, body };
  if (stream) {
    delete req.body;
    req[Symbol.asyncIterator] = async function* () {
      for (const chunk of stream) yield chunk;
    };
  }
  const headers = new Map();
  let text = "";
  const res = {
    statusCode: 200,
    setHeader: (name, value) => headers.set(name, value),
    end: (value = "") => { text = value; },
  };
  await handler(req, res);
  return { status: res.statusCode, headers, body: text ? JSON.parse(text) : null };
}

test("missing and whitespace-only required fields return 400 without contacting Google", async (t) => {
  let outgoingCalls = 0;
  const handler = loadHandler(async () => { outgoingCalls += 1; return { ok: true }; });
  for (const field of Object.keys(fields).slice(0, 4)) {
    for (const value of [undefined, "", "  \n "]) {
      await t.test(`${field}: ${JSON.stringify(value)}`, async () => {
        const body = { ...fields };
        if (value === undefined) delete body[field];
        else body[field] = value;
        const result = await request(handler, { body });
        assert.equal(result.status, 400);
        assert.equal(result.body.ok, false);
        assert.equal(outgoingCalls, 0);
      });
    }
  }
});

test("forwards exactly five trimmed fields and controlled Google form metadata", async () => {
  const outgoing = [];
  const handler = loadHandler(async (url, options) => {
    outgoing.push({ url, options });
    return { ok: true };
  });
  const padded = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, ` ${value} `]));
  const body = new URLSearchParams({ ...padded, unexpected: "not forwarded", fvv: "999", pageHistory: "999" });
  const result = await request(handler, { body: body.toString() });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(result.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(outgoing.length, 1);
  const { url, options } = outgoing[0];
  assert.equal(new URL(url).origin, "https://docs.google.com");
  assert.match(new URL(url).pathname, /^\/forms\/d\/e\/[^/]+\/formResponse$/);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded;charset=UTF-8");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), { ...fields, fvv: "1", pageHistory: "0" });
});

test("the optional employee count may be omitted, including streamed request bodies", async () => {
  let forwarded;
  const handler = loadHandler(async (_url, { body }) => {
    forwarded = new URLSearchParams(body);
    return { ok: true };
  });
  const body = { ...fields };
  delete body["entry.749671614"];
  const encoded = new URLSearchParams(body).toString();
  const result = await request(handler, { stream: [encoded.slice(0, 20), encoded.slice(20)] });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(forwarded.get("entry.749671614"), "");
  for (const [key, value] of Object.entries(body)) assert.equal(forwarded.get(key), value);
});

test("upstream HTTP and network failures return 502 instead of a success", async (t) => {
  for (const [name, fetch] of [
    ["Google rejects submission", async () => ({ ok: false, status: 400 })],
    ["Google is unavailable", async () => ({ ok: false, status: 503 })],
    ["network rejection", async () => { throw new TypeError("No network"); }],
  ]) {
    await t.test(name, async () => {
      const result = await request(loadHandler(fetch));
      assert.equal(result.status, 502);
      assert.equal(result.body.ok, false);
    });
  }
});

test("non-POST methods return 405 and OPTIONS returns 204 without an upstream call", async () => {
  let outgoingCalls = 0;
  const handler = loadHandler(async () => { outgoingCalls += 1; return { ok: true }; });
  for (const method of ["GET", "PUT", "DELETE"]) {
    const result = await request(handler, { method });
    assert.equal(result.status, 405);
    assert.equal(result.body.ok, false);
  }
  const options = await request(handler, { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.equal(options.body, null);
  assert.equal(outgoingCalls, 0);
});
