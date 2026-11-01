"use strict";

// Vercel Functions の中身。store（Notion の読み出し）を差し替えてテストできるようにしている。
const { SITE_ORIGIN, blocksToHtml, escapeHtml } = require("./blocks");
const { imageProxyUrl } = require("./notion");
const { BLOG_DESCRIPTION, BLOG_NAME, isoDay, renderArticlePage, renderListPage, renderMessagePage } = require("./pages");

// Notion の更新は最大5分で反映（おそうじノートと同じ）
const HTML_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const SHORT_CACHE = "public, max-age=0, s-maxage=60";
const IMAGE_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

// LP 側の URL（以前の静的 sitemap.xml と同じ）
const STATIC_URLS = [{ loc: `${SITE_ORIGIN}/`, lastmod: "2026-10-31", changefreq: "weekly", priority: "1.0" }];

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(body);
}

function sendHtml(res, status, html, cache = HTML_CACHE) {
  send(res, status, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache });
}

function queryParam(req, name) {
  if (req.query && typeof req.query[name] === "string") return req.query[name];
  return new URL(req.url || "/", SITE_ORIGIN).searchParams.get(name) || "";
}

// /blog/:slug の rewrite は ?slug= で渡すが、念のためパスからも読む
function slugFromRequest(req) {
  const slug = queryParam(req, "slug");
  if (slug) return slug;
  const match = new URL(req.url || "/", SITE_ORIGIN).pathname.match(/^\/blog\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function createHandlers(getStore) {
  async function loadPosts() {
    const store = getStore();
    if (!store) return { store: null, posts: [], unavailable: false };
    try {
      return { store, posts: await store.listPosts(), unavailable: false };
    } catch (error) {
      console.error("[blog] Notion から記事一覧を読めませんでした", error);
      return { store, posts: [], unavailable: true };
    }
  }

  async function list(req, res) {
    const { posts, unavailable } = await loadPosts();
    const html = renderListPage({ posts, category: queryParam(req, "category"), unavailable });
    sendHtml(res, 200, html, unavailable ? SHORT_CACHE : HTML_CACHE);
  }

  function notFound(res) {
    sendHtml(
      res,
      404,
      renderMessagePage({ title: "記事が見つかりませんでした", message: "URLが変わったか、記事が公開を終了した可能性があります。ブログの記事一覧からお探しください。" }),
      SHORT_CACHE,
    );
  }

  async function article(req, res) {
    const slug = slugFromRequest(req);
    const { store, posts, unavailable } = await loadPosts();
    if (unavailable) {
      res.setHeader("Retry-After", "300");
      sendHtml(res, 503, renderMessagePage({ title: "記事を表示できません", message: "ただいま記事を読み込めません。時間をおいて、もう一度お試しください。" }), "no-store");
      return;
    }
    const post = posts.find((item) => item.slug === slug);
    if (!store || !post) {
      notFound(res);
      return;
    }
    try {
      const { blocks } = await store.getPost(slug);
      // アイキャッチに本文の最初の画像を使ったときは、本文では重ねて出さない
      const firstImage = blocks.find((block) => block.type === "image");
      const skipImageId = firstImage && post.thumbnailUrl === imageProxyUrl(firstImage.id) ? firstImage.id : "";
      const { html, headings } = blocksToHtml(blocks, { skipImageId });
      sendHtml(res, 200, renderArticlePage({ post, html, headings, posts }));
    } catch (error) {
      console.error("[blog] Notion から記事本文を読めませんでした", error);
      res.setHeader("Retry-After", "300");
      sendHtml(res, 503, renderMessagePage({ title: "記事を表示できません", message: "ただいま記事を読み込めません。時間をおいて、もう一度お試しください。" }), "no-store");
    }
  }

  async function image(req, res) {
    const id = queryParam(req, "id");
    const store = getStore();
    if (!store || !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
      send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    try {
      const url = await store.getImageUrl(id);
      const response = url ? await fetch(url) : null;
      const type = response ? response.headers.get("content-type") || "" : "";
      if (!response || !response.ok || !type.startsWith("image/")) {
        send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": SHORT_CACHE });
        return;
      }
      send(res, 200, Buffer.from(await response.arrayBuffer()), { "Content-Type": type, "Cache-Control": IMAGE_CACHE });
    } catch (error) {
      console.error("[blog] Notion の画像を取得できませんでした", error);
      send(res, 502, "Bad gateway", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    }
  }

  async function sitemap(req, res) {
    const { posts } = await loadPosts();
    const urls = [...STATIC_URLS];
    if (posts.length) {
      const latest = posts.map((post) => isoDay(post.updatedAt)).sort().pop();
      urls.push({ loc: `${SITE_ORIGIN}/blog`, lastmod: latest, changefreq: "daily", priority: "0.8" });
      for (const post of posts) {
        urls.push({ loc: `${SITE_ORIGIN}/blog/${encodeURIComponent(post.slug)}`, lastmod: isoDay(post.updatedAt), changefreq: "monthly", priority: "0.7" });
      }
    }
    const body = urls
      .map(
        (url) =>
          `  <url>\n    <loc>${escapeHtml(url.loc)}</loc>\n${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>\n` : ""}    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
      )
      .join("\n");
    send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": HTML_CACHE,
    });
  }

  async function feed(req, res) {
    const { posts } = await loadPosts();
    const items = posts
      .slice(0, 20)
      .map(
        (post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${SITE_ORIGIN}/blog/${encodeURIComponent(post.slug)}</link>
      <guid isPermaLink="true">${SITE_ORIGIN}/blog/${encodeURIComponent(post.slug)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
    </item>`,
      )
      .join("\n");
    send(
      res,
      200,
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${BLOG_NAME}</title>
    <link>${SITE_ORIGIN}/blog</link>
    <description>${escapeHtml(BLOG_DESCRIPTION)}</description>
    <language>ja</language>
${items}
  </channel>
</rss>
`,
      { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": HTML_CACHE },
    );
  }

  return { list, article, image, sitemap, feed };
}

module.exports = { createHandlers };
