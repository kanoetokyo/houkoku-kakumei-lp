const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { createBlogStore, isScheduledPostDue, latestBySlug, pageToPost } = require("../api/_lib/blog/notion");
const { blocksToHtml } = require("../api/_lib/blog/blocks");
const { createHandlers } = require("../api/_lib/blog/handlers");

const NOW = Date.parse("2026-11-01T03:00:00Z");

function rt(text, extra = {}) {
  return [{ plain_text: text, annotations: {}, href: null, ...extra }];
}

function page({ id, title, slug, status = "published", publishedAt = "2026-10-01", summary = "", cats = [], names = [], author, thumb, edited }) {
  return {
    id,
    created_time: "2026-09-01T00:00:00.000Z",
    last_edited_time: edited || "2026-10-20T00:00:00.000Z",
    properties: {
      title: { type: "title", title: rt(title) },
      slug: { type: "rich_text", rich_text: rt(slug) },
      status: { type: "select", select: status ? { name: status } : null },
      published_at: { type: "date", date: publishedAt ? { start: publishedAt } : null },
      summary: { type: "rich_text", rich_text: rt(summary) },
      category_slug: { type: "multi_select", multi_select: cats.map((name) => ({ name })) },
      category_name: { type: "multi_select", multi_select: names.map((name) => ({ name })) },
      author_name: { type: "select", select: author ? { name: author } : null },
      thumbnail_url: { type: "url", url: thumb || null },
    },
  };
}

function block(id, type, value = {}, children) {
  return { id, type, has_children: Boolean(children), [type]: value, ...(children ? { children } : {}) };
}

const IMAGE_ID = "11111111-2222-3333-4444-555555555555";

function fakeClient({ pages, blocks = {}, images = {}, failQuery = false }) {
  const calls = { query: 0, children: 0 };
  return {
    calls,
    dataSources: {
      async query() {
        calls.query += 1;
        if (failQuery) throw new Error("notion down");
        const results = pages.filter((p) => ["published", "scheduled"].includes(p.properties.status.select && p.properties.status.select.name));
        return { results, has_more: false, next_cursor: null };
      },
    },
    blocks: {
      children: {
        async list({ block_id }) {
          calls.children += 1;
          return { results: (blocks[block_id] || []).map(({ children, ...rest }) => rest), has_more: false, next_cursor: null };
        },
      },
      async retrieve({ block_id }) {
        return images[block_id] || { type: "paragraph" };
      },
    },
  };
}

function samplePages() {
  return [
    page({ id: "p-a", title: "**日報が続かない理由**", slug: "**nippou-tsuzukanai** ", summary: "要約A", cats: ["report"], names: ["日報・報告の仕組み"], publishedAt: "2026-10-20" }),
    page({ id: "p-b", title: "LINEグループの限界", slug: "line-group", cats: ["tools"], names: ["情報共有ツールの選び方"], publishedAt: "2026-10-10", thumb: "https://example.com/b.jpg", author: "勅使河原　将" }),
    page({ id: "p-c", title: "下書きの記事", slug: "draft-post", status: "draft" }),
    page({ id: "p-d", title: "予約の記事", slug: "scheduled-post", status: "scheduled", publishedAt: "2026-12-01T09:00:00+09:00" }),
  ];
}

function sampleBlocks() {
  return {
    "p-a": [
      block("b1", "paragraph", { rich_text: rt("はじめに") }),
      block(IMAGE_ID, "image", { type: "file", file: { url: "https://files.example/a.png" }, caption: rt("要点まとめ") }),
      block("b2", "heading_2", { rich_text: rt("報告が集まらない理由") }),
      block("b3", "bulleted_list_item", { rich_text: rt("書く場所がない") }),
      block("b4", "heading_2", { rich_text: rt("仕組みで解決する") }),
    ],
  };
}

function makeStore(options = {}) {
  const client = fakeClient({ pages: samplePages(), blocks: sampleBlocks(), ...options });
  let time = NOW;
  const store = createBlogStore({ client, now: () => time });
  return { client, store, advance: (ms) => (time += ms) };
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("Notionのページを記事に変換し、太字記法や空欄を整える", () => {
  const post = pageToPost(samplePages()[0], NOW);
  assert.equal(post.title, "日報が続かない理由");
  assert.equal(post.slug, "nippou-tsuzukanai");
  assert.equal(post.status, "published");
  assert.equal(post.authorName, "報告革命 編集部");
  assert.deepEqual(post.categories, [{ slug: "report", name: "日報・報告の仕組み" }]);
  assert.equal(pageToPost(page({ id: "x", title: "", slug: "a" }), NOW), null);
  assert.equal(pageToPost(page({ id: "x", title: "a", slug: "" }), NOW), null);
});

test("予約記事は公開日時を過ぎたら公開扱いになる（日付だけなら日本時間9時）", () => {
  assert.equal(isScheduledPostDue("2026-11-03", Date.parse("2026-11-02T23:59:59Z")), false);
  assert.equal(isScheduledPostDue("2026-11-03", Date.parse("2026-11-03T00:00:00Z")), true);
  assert.equal(isScheduledPostDue("", NOW), false);
  const scheduled = page({ id: "s", title: "t", slug: "s", status: "scheduled", publishedAt: "2026-11-01T09:00:00+09:00" });
  assert.equal(pageToPost(scheduled, Date.parse("2026-10-31T23:59:00Z")).status, "scheduled");
  assert.equal(pageToPost(scheduled, Date.parse("2026-11-01T00:00:00Z")).status, "published");
});

test("同じslugの記事は公開日時が新しいほうを残し、新しい順に並べる", () => {
  const posts = latestBySlug([
    { slug: "a", publishedAt: "2026-10-01", title: "古い" },
    { slug: "b", publishedAt: "2026-10-05", title: "B" },
    { slug: "a", publishedAt: "2026-10-09", title: "新しい" },
  ]);
  assert.deepEqual(posts.map((p) => p.title), ["新しい", "B"]);
});

test("本文のHTMLは文字をエスケープし、見出しに目次用のidを付ける", () => {
  const { html, headings } = blocksToHtml([
    block("h1", "heading_1", { rich_text: rt("大見出し") }),
    block("p1", "paragraph", { rich_text: rt("<script>alert(1)</script>") }),
    block("h3", "heading_3", { rich_text: rt("小見出し") }),
    block("l1", "bulleted_list_item", { rich_text: rt("一つ目") }, [block("l1a", "bulleted_list_item", { rich_text: rt("入れ子") })]),
    block("l2", "bulleted_list_item", { rich_text: rt("二つ目") }),
    block("n1", "numbered_list_item", { rich_text: rt("手順1") }),
    block("c1", "callout", { rich_text: rt("ポイント"), icon: { type: "emoji", emoji: "💡" } }),
  ]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<h2 id="sec-1">大見出し<\/h2>/);
  assert.match(html, /<h3 id="sec-2">小見出し<\/h3>/);
  assert.deepEqual(headings, [{ id: "sec-1", text: "大見出し" }]);
  assert.match(html, /<ul><li>一つ目<ul><li>入れ子<\/li><\/ul><\/li><li>二つ目<\/li><\/ul><ol><li>手順1<\/li><\/ol>/);
  assert.match(html, /class="post-callout"/);
});

test("リンクと画像：社内リンクは同じタブ、外部は新しいタブ、Notionの画像はプロキシ経由", () => {
  const { html } = blocksToHtml([
    block("p", "paragraph", {
      rich_text: [
        ...rt("料金", { href: "https://hokokukakumei.com/#price" }),
        ...rt("外部", { href: "https://example.com/x" }),
        ...rt("社内メモ", { href: "https://www.notion.so/abc" }),
        ...rt("太字", { annotations: { bold: true } }),
      ],
    }),
    block(IMAGE_ID, "image", { type: "file", file: { url: "https://files.example/a.png" }, caption: rt("図解") }),
    block("img2", "image", { type: "external", external: { url: "https://cdn.example/b.png" }, caption: [] }),
  ]);
  assert.match(html, /<a href="\/#price">料金<\/a>/);
  assert.match(html, /<a href="https:\/\/example.com\/x" target="_blank" rel="noopener">外部<\/a>/);
  assert.doesNotMatch(html, /notion\.so/);
  assert.match(html, /<strong>太字<\/strong>/);
  assert.match(html, new RegExp(`src="/api/notion-image\\?id=${IMAGE_ID}" alt="図解"`));
  assert.match(html, /<figcaption>図解<\/figcaption>/);
  assert.match(html, /src="https:\/\/cdn.example\/b.png" alt="記事の図解"/);
  assert.doesNotMatch(blocksToHtml([block(IMAGE_ID, "image", { type: "file", file: { url: "u" }, caption: [] })], { skipImageId: IMAGE_ID }).html, /img/);
});

test("記事一覧は公開中だけを新しい順に返し、5分間はNotionに問い合わせない", async () => {
  const { client, store, advance } = makeStore();
  const posts = await store.listPosts();
  assert.deepEqual(posts.map((p) => p.slug), ["nippou-tsuzukanai", "line-group"]);
  assert.equal(posts[0].thumbnailUrl, `/api/notion-image?id=${IMAGE_ID}`);
  assert.equal(posts[1].thumbnailUrl, "https://example.com/b.jpg");
  await store.listPosts();
  assert.equal(client.calls.query, 1);
  advance(5 * 60 * 1000 + 1);
  await store.listPosts();
  assert.equal(client.calls.query, 2);
});

test("Notionが落ちても、直前に読めた記事一覧を返す", async () => {
  const pages = samplePages();
  const client = fakeClient({ pages, blocks: sampleBlocks() });
  let time = NOW;
  const store = createBlogStore({ client, now: () => time });
  await store.listPosts();
  client.dataSources.query = async () => {
    throw new Error("down");
  };
  time += 10 * 60 * 1000;
  assert.equal((await store.listPosts()).length, 2);
});

test("一覧ページ：記事カードと構造化データを出し、カテゴリ絞り込みはnoindexにする", async () => {
  const { store } = makeStore();
  const handlers = createHandlers(() => store);
  const res = fakeRes();
  await handlers.list({ url: "/blog", query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["cache-control"], /s-maxage=300/);
  assert.match(res.body, /<h1>報告革命ブログ/);
  assert.match(res.body, /href="\/blog\/nippou-tsuzukanai"/);
  assert.doesNotMatch(res.body, /draft-post|scheduled-post/);
  assert.match(res.body, /"@type":"Blog"/);
  assert.match(res.body, /<link rel="canonical" href="https:\/\/hokokukakumei.com\/blog" \/>/);
  assert.match(res.body, /content="index, follow/);

  const filtered = fakeRes();
  await handlers.list({ url: "/blog?category=tools", query: { category: "tools" } }, filtered);
  assert.match(filtered.body, /content="noindex, follow"/);
  assert.match(filtered.body, /line-group/);
  assert.doesNotMatch(filtered.body, /href="\/blog\/nippou-tsuzukanai"/);
});

test("記事ページ：本文・目次・canonical・BlogPostingを出し、アイキャッチの画像は本文で重ねない", async () => {
  const { store } = makeStore();
  const res = fakeRes();
  await createHandlers(() => store).article({ url: "/api/blog-post?slug=nippou-tsuzukanai", query: { slug: "nippou-tsuzukanai" } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>日報が続かない理由｜報告革命ブログ<\/title>/);
  assert.match(res.body, /<h1>日報が続かない理由<\/h1>/);
  assert.match(res.body, /<link rel="canonical" href="https:\/\/hokokukakumei.com\/blog\/nippou-tsuzukanai" \/>/);
  assert.match(res.body, /<nav class="post-toc"/);
  assert.match(res.body, /href="#sec-2">仕組みで解決する/);
  assert.match(res.body, /"@type":"BlogPosting"/);
  assert.match(res.body, /"@type":"BreadcrumbList"/);
  assert.match(res.body, /href="https:\/\/lin.ee\/RuumZrp" target="_blank" rel="noopener" data-line-cta="blog"/);
  assert.match(res.body, new RegExp(`<figure class="post-eyecatch"><img src="/api/notion-image\\?id=${IMAGE_ID}"`));
  assert.match(res.body, new RegExp(`<meta property="og:image" content="https://hokokukakumei.com/api/notion-image\\?id=${IMAGE_ID}"`));
  const body = res.body.slice(res.body.indexOf('<div class="post-body">'), res.body.indexOf('<aside class="post-cta"'));
  assert.doesNotMatch(body, new RegExp(IMAGE_ID), "本文ではアイキャッチの画像を重ねない");
  assert.match(body, /はじめに/);
  assert.match(res.body, /あわせて読みたい記事/);
});

test("下書き・存在しない記事は404、Notionのキーがなければ一覧は準備中でnoindex", async () => {
  const { store } = makeStore();
  const handlers = createHandlers(() => store);
  for (const slug of ["draft-post", "scheduled-post", "nothing"]) {
    const res = fakeRes();
    await handlers.article({ url: `/blog/${slug}`, query: {} }, res);
    assert.equal(res.statusCode, 404, slug);
    assert.match(res.body, /noindex/);
  }

  const noKey = createHandlers(() => null);
  const list = fakeRes();
  await noKey.list({ url: "/blog", query: {} }, list);
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /記事を準備しています/);
  assert.match(list.body, /content="noindex, follow"/);
  const article = fakeRes();
  await noKey.article({ url: "/blog/x", query: { slug: "x" } }, article);
  assert.equal(article.statusCode, 404);
});

test("Notionが読めないとき、記事は503・一覧は読み込めない旨を出す", async () => {
  const client = fakeClient({ pages: samplePages(), failQuery: true });
  const handlers = createHandlers(() => createBlogStore({ client, now: () => NOW }));
  const article = fakeRes();
  await handlers.article({ url: "/blog/x", query: { slug: "x" } }, article);
  assert.equal(article.statusCode, 503);
  const list = fakeRes();
  await handlers.list({ url: "/blog", query: {} }, list);
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /記事を読み込めませんでした/);
});

test("サイトマップとRSSに公開中の記事が入り、キーがなくてもLPのURLは返す", async () => {
  const { store } = makeStore();
  const res = fakeRes();
  await createHandlers(() => store).sitemap({ url: "/sitemap.xml" }, res);
  assert.match(res.headers["content-type"], /application\/xml/);
  assert.match(res.body, /<loc>https:\/\/hokokukakumei.com\/<\/loc>/);
  assert.match(res.body, /<loc>https:\/\/hokokukakumei.com\/blog<\/loc>/);
  assert.match(res.body, /<loc>https:\/\/hokokukakumei.com\/blog\/nippou-tsuzukanai<\/loc>\n    <lastmod>2026-10-20<\/lastmod>/);
  assert.doesNotMatch(res.body, /draft-post/);

  const feed = fakeRes();
  await createHandlers(() => store).feed({ url: "/blog/feed.xml" }, feed);
  assert.match(feed.body, /<rss version="2.0">/);
  assert.match(feed.body, /<title>日報が続かない理由<\/title>/);

  const empty = fakeRes();
  await createHandlers(() => null).sitemap({ url: "/sitemap.xml" }, empty);
  assert.match(empty.body, /<loc>https:\/\/hokokukakumei.com\/<\/loc>/);
  assert.doesNotMatch(empty.body, /\/blog/);
});

test("画像プロキシ：不正なidは404、Notionの画像はそのまま返して長めにキャッシュする", async () => {
  const images = { [IMAGE_ID]: { type: "image", image: { type: "file", file: { url: "https://files.example/a.png" } } } };
  const client = fakeClient({ pages: samplePages(), images });
  const handlers = createHandlers(() => createBlogStore({ client, now: () => NOW }));
  const bad = fakeRes();
  await handlers.image({ url: "/api/notion-image?id=../../etc", query: { id: "../../etc" } }, bad);
  assert.equal(bad.statusCode, 404);

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(url, "https://files.example/a.png");
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  };
  try {
    const res = fakeRes();
    await handlers.image({ url: `/api/notion-image?id=${IMAGE_ID}`, query: { id: IMAGE_ID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.match(res.headers["cache-control"], /s-maxage=86400/);
    assert.equal(res.body.length, 4);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Vercelの設定：ブログとサイトマップを関数へ流し、静的なsitemap.xmlは置かない", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const rewrites = Object.fromEntries(config.rewrites.map((r) => [r.source, r.destination]));
  assert.equal(rewrites["/blog"], "/api/blog");
  assert.equal(rewrites["/blog/:slug"], "/api/blog-post?slug=:slug");
  assert.equal(rewrites["/sitemap.xml"], "/api/sitemap");
  assert.ok(!fs.existsSync(path.join(root, "sitemap.xml")));
  for (const name of ["blog", "blog-post", "notion-image", "sitemap", "blog-feed"]) {
    assert.ok(fs.existsSync(path.join(root, "api", `${name}.js`)), name);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@notionhq/client"], "5.16.0");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((html.match(/<a href="\/blog">ブログ<\/a>/g) || []).length, 2, "ヘッダーとフッター");
});
