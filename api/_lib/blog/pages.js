"use strict";

// ブログ一覧・記事・404 のページ HTML。ヘッダーとフッターは LP と同じ見た目にする。
const { SITE_ORIGIN, escapeHtml } = require("./blocks");

const LINE_URL = "https://lin.ee/RuumZrp";
const BLOG_NAME = "報告革命ブログ";
const BLOG_DESCRIPTION = "店舗・現場をもつ経営者のための、報告・日報・情報共有のヒント。スタッフからの報告が自然に集まる仕組みづくりを、現場目線で紹介します。";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/assets/og-image.png`;
const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_ORIGIN}/#organization`,
  name: "株式会社カノエ",
  url: `${SITE_ORIGIN}/`,
  logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/assets/app-icon.webp` },
};

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });

function formatDate(iso) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : dateFormat.format(time);
}

function isoDay(iso) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : dayKey.format(time);
}

function absoluteUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  return /^https?:\/\//.test(url) ? url : `${SITE_ORIGIN}${url}`;
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function chatIcon() {
  return '<svg class="icon-chat" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-chat" /></svg>';
}

function arrowIcon() {
  return '<svg class="icon-arrow" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-arrow" /></svg>';
}

function header(current) {
  const nav = [
    ["/#problem", "お悩み"],
    ["/#how", "できること"],
    ["/#cases", "業種別の例"],
    ["/#app", "アプリ"],
    ["/#price", "料金"],
    ["/#faq", "よくある質問"],
    ["/blog", "ブログ"],
  ]
    .map(([href, label]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  return `<a class="skip-link" href="#main">本文へ移動する</a>
    <header class="site-header" data-header>
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="報告革命 トップへ">
          <img src="/assets/app-icon.webp" alt="" width="36" height="36" />
          <span>報告革命</span>
        </a>
        <nav class="header-nav" aria-label="サイト内">${nav}</nav>
        <a class="btn btn-line btn-sm" href="${LINE_URL}" target="_blank" rel="noopener" data-line-cta="header">
          ${chatIcon()}<span>LINEで問い合わせ</span>
        </a>
      </div>
    </header>`;
}

function footer() {
  return `<footer class="site-footer">
      <div class="container footer-inner">
        <div class="footer-brand">
          <a class="brand" href="/">
            <img src="/assets/app-icon.webp" alt="" width="32" height="32" loading="lazy" />
            <span>報告革命</span>
          </a>
          <p>運営：<a href="https://www.kanoebiz.com/" target="_blank" rel="noopener">株式会社カノエ</a></p>
        </div>
        <nav class="footer-nav" aria-label="サイト情報">
          <a href="/blog">ブログ</a>
          <a href="https://app.hokokukakumei.com/legal/terms" target="_blank" rel="noopener">利用規約</a>
          <a href="https://app.hokokukakumei.com/legal/privacy" target="_blank" rel="noopener">プライバシーポリシー</a>
          <a href="https://app.hokokukakumei.com/legal/tokushoho" target="_blank" rel="noopener">特定商取引法に基づく表記</a>
          <a href="https://app.hokokukakumei.com/login">ログイン</a>
          <a href="${LINE_URL}" target="_blank" rel="noopener" data-line-cta="footer">お問い合わせ（LINE）</a>
        </nav>
        <p class="copyright">© KANOE Inc.</p>
      </div>
    </footer>
    <div class="mobile-cta" data-mobile-cta>
      <a class="btn btn-line" href="${LINE_URL}" target="_blank" rel="noopener" data-line-cta="sticky">${chatIcon()}LINEで問い合わせる</a>
    </div>
    <svg class="sprite" aria-hidden="true" focusable="false">
      <symbol id="i-chat" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 3.2c-5.5 0-10 3.6-10 8 0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.4 5.9-3.4 8-5.9 1.4-1.6 2-3.2 2-4.9 0-4.4-4.5-8-10-8Z" />
      </symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
      </symbol>
    </svg>`;
}

function layout({ title, description, canonical, robots = "index, follow, max-image-preview:large", ogType = "website", image, schema, current, body }) {
  const ogImage = absoluteUrl(image);
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />
    <meta name="theme-color" content="#f15a19" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ""}
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="alternate" type="application/rss+xml" title="${BLOG_NAME}" href="/blog/feed.xml" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="報告革命" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ""}
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    ${schema ? jsonLd(schema) : ""}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet" />
    <script>document.documentElement.classList.add("js");</script>
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/blog.css" />
    <script src="/script.js" defer></script>
  </head>
  <body class="blog-page">
    ${header(current)}
    ${body}
    ${footer()}
  </body>
</html>
`;
}

function categoryHref(slug) {
  return `/blog?category=${encodeURIComponent(slug)}`;
}

function thumbnail(post, className) {
  if (!post.thumbnailUrl) {
    return `<div class="${className} is-empty" aria-hidden="true"><img src="/assets/app-icon.webp" alt="" width="64" height="64" loading="lazy" /></div>`;
  }
  return `<div class="${className}"><img src="${escapeHtml(post.thumbnailUrl)}" alt="" loading="lazy" decoding="async" /></div>`;
}

function postCard(post, headingTag) {
  const category = post.categories[0];
  return `<li class="post-card">
          <a href="/blog/${encodeURIComponent(post.slug)}">
            ${thumbnail(post, "post-card-thumb")}
            <div class="post-card-body">
              ${category ? `<p class="post-card-cat">${escapeHtml(category.name)}</p>` : ""}
              <${headingTag} class="post-card-title">${escapeHtml(post.title)}</${headingTag}>
              ${post.summary ? `<p class="post-card-summary">${escapeHtml(post.summary)}</p>` : ""}
              <time datetime="${escapeHtml(post.publishedAt)}">${formatDate(post.publishedAt)}</time>
            </div>
          </a>
        </li>`;
}

function ctaBox() {
  return `<aside class="post-cta" data-final-cta aria-labelledby="post-cta-title">
        <p class="post-cta-kicker">店舗・現場をもつ経営者の方へ</p>
        <p class="post-cta-title" id="post-cta-title">現場の“いま”が、スマホに届く。</p>
        <p class="post-cta-text">報告革命は、スタッフが写真とひと言で今日の現場を報告できるアプリです。iPhone・Androidに対応し、1人月額550円（税込）から使えます。</p>
        <div class="post-cta-actions">
          <a class="btn btn-line btn-lg" href="${LINE_URL}" target="_blank" rel="noopener" data-line-cta="blog">
            ${chatIcon()}LINEで画面を見てみる${arrowIcon()}
          </a>
          <a class="post-cta-link" href="/">報告革命について詳しく見る</a>
        </div>
      </aside>`;
}

function breadcrumb(items) {
  const list = items
    .map(([href, label], index) =>
      index === items.length - 1
        ? `<li aria-current="page">${escapeHtml(label)}</li>`
        : `<li><a href="${href}">${escapeHtml(label)}</a></li>`,
    )
    .join("");
  return `<nav class="breadcrumb" aria-label="パンくずリスト"><ol>${list}</ol></nav>`;
}

function breadcrumbSchema(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([href, label], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: label,
      item: `${SITE_ORIGIN}${href}`,
    })),
  };
}

function listCategories(posts) {
  const categories = new Map();
  for (const post of posts) {
    for (const category of post.categories) {
      if (!categories.has(category.slug)) categories.set(category.slug, category.name);
    }
  }
  return [...categories].map(([slug, name]) => ({ slug, name }));
}

function renderListPage({ posts, category = "", unavailable = false }) {
  const categories = listCategories(posts);
  const active = categories.find((item) => item.slug === category);
  const visible = active ? posts.filter((post) => post.categories.some((item) => item.slug === category)) : posts;
  const filtered = Boolean(category);
  const crumbs = [["/", "ホーム"], ["/blog", "ブログ"]];

  const filters = categories.length
    ? `<nav class="blog-cats" aria-label="カテゴリ">
            <a href="/blog"${filtered ? "" : ' aria-current="page"'}>すべて</a>
            ${categories
              .map((item) => `<a href="${categoryHref(item.slug)}"${item.slug === category ? ' aria-current="page"' : ""}>${escapeHtml(item.name)}</a>`)
              .join("")}
          </nav>`
    : "";

  const list = visible.length
    ? `<ul class="post-grid">${visible.map((post) => postCard(post, "h2")).join("")}</ul>`
    : `<p class="blog-empty">${unavailable ? "記事を読み込めませんでした。時間をおいて、もう一度お試しください。" : filtered ? "このカテゴリの記事はまだありません。" : "記事を準備しています。もうしばらくお待ちください。"}</p>`;

  const body = `<main id="main" class="blog-main">
      <section class="blog-hero" data-hero-cta>
        <div class="container">
          ${breadcrumb(crumbs)}
          <h1>${BLOG_NAME}${active ? `<span class="blog-hero-sub">${escapeHtml(active.name)}</span>` : ""}</h1>
          <p class="blog-lead">店舗・現場をもつ経営者のための、<span class="nw">報告・日報・情報共有のヒント。</span></p>
          ${filters}
        </div>
      </section>
      <section class="container blog-list" aria-label="記事一覧">
        ${list}
      </section>
      <div class="container blog-cta-wrap">${ctaBox()}</div>
    </main>`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      {
        "@type": "Blog",
        "@id": `${SITE_ORIGIN}/blog#blog`,
        name: BLOG_NAME,
        description: BLOG_DESCRIPTION,
        url: `${SITE_ORIGIN}/blog`,
        inLanguage: "ja",
        publisher: { "@id": ORGANIZATION["@id"] },
        blogPost: posts.slice(0, 20).map((post) => ({
          "@type": "BlogPosting",
          headline: post.title,
          url: `${SITE_ORIGIN}/blog/${post.slug}`,
          datePublished: post.publishedAt,
        })),
      },
      breadcrumbSchema(crumbs),
    ],
  };

  return layout({
    title: active ? `${active.name}の記事一覧｜${BLOG_NAME}` : `${BLOG_NAME}｜店舗・現場の報告・日報・情報共有のヒント`,
    description: BLOG_DESCRIPTION,
    canonical: `${SITE_ORIGIN}/blog`,
    robots: filtered || unavailable || !posts.length ? "noindex, follow" : undefined,
    schema,
    current: "/blog",
    body,
  });
}

function relatedPosts(post, posts) {
  const slugs = new Set(post.categories.map((item) => item.slug));
  const others = posts.filter((item) => item.slug !== post.slug);
  const sameCategory = others.filter((item) => item.categories.some((category) => slugs.has(category.slug)));
  const rest = others.filter((item) => !sameCategory.includes(item));
  return [...sameCategory, ...rest].slice(0, 3);
}

function renderArticlePage({ post, html, headings, posts }) {
  const canonical = `${SITE_ORIGIN}/blog/${post.slug}`;
  const crumbs = [["/", "ホーム"], ["/blog", "ブログ"], [`/blog/${post.slug}`, post.title]];
  const published = formatDate(post.publishedAt);
  const updated = isoDay(post.updatedAt) > isoDay(post.publishedAt) ? formatDate(post.updatedAt) : "";
  const related = relatedPosts(post, posts);
  const isOrganization = post.authorName.includes("編集部");

  const toc =
    headings.length >= 2
      ? `<nav class="post-toc" aria-labelledby="post-toc-title">
            <p class="post-toc-title" id="post-toc-title">この記事の目次</p>
            <ol>${headings.map((item) => `<li><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`).join("")}</ol>
          </nav>`
      : "";

  const body = `<main id="main" class="blog-main">
      <article class="post">
        <div class="container post-container">
          ${breadcrumb(crumbs)}
          <header class="post-header" data-hero-cta>
            ${
              post.categories.length
                ? `<ul class="post-cats">${post.categories.map((item) => `<li><a href="${categoryHref(item.slug)}">${escapeHtml(item.name)}</a></li>`).join("")}</ul>`
                : ""
            }
            <h1>${escapeHtml(post.title)}</h1>
            <p class="post-meta">
              <span>公開日 <time datetime="${escapeHtml(post.publishedAt)}">${published}</time></span>
              ${updated ? `<span>更新日 <time datetime="${escapeHtml(post.updatedAt)}">${updated}</time></span>` : ""}
              <span>文：${escapeHtml(post.authorName)}</span>
            </p>
          </header>
          ${post.thumbnailUrl ? `<figure class="post-eyecatch"><img src="${escapeHtml(post.thumbnailUrl)}" alt="" fetchpriority="high" decoding="async" /></figure>` : ""}
          ${toc}
          <div class="post-body">${html}</div>
          ${ctaBox()}
        </div>
      </article>
      ${
        related.length
          ? `<section class="related" aria-labelledby="related-title">
        <div class="container">
          <h2 class="related-title" id="related-title">あわせて読みたい記事</h2>
          <ul class="post-grid">${related.map((item) => postCard(item, "h3")).join("")}</ul>
          <p class="related-back"><a href="/blog">ブログの記事一覧へ</a></p>
        </div>
      </section>`
          : ""
      }
    </main>`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      {
        "@type": "BlogPosting",
        "@id": `${canonical}#article`,
        headline: post.title,
        description: post.summary,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        inLanguage: "ja",
        image: [absoluteUrl(post.thumbnailUrl)],
        author: isOrganization
          ? { "@type": "Organization", name: post.authorName, url: `${SITE_ORIGIN}/` }
          : { "@type": "Person", name: post.authorName },
        publisher: { "@id": ORGANIZATION["@id"] },
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        isPartOf: { "@id": `${SITE_ORIGIN}/blog#blog` },
      },
      breadcrumbSchema(crumbs),
    ],
  };

  return layout({
    title: `${post.title}｜${BLOG_NAME}`,
    description: post.summary || BLOG_DESCRIPTION,
    canonical,
    ogType: "article",
    image: post.thumbnailUrl,
    schema,
    body,
  });
}

function renderMessagePage({ title, message }) {
  const body = `<main id="main" class="blog-main">
      <section class="blog-hero blog-message" data-hero-cta>
        <div class="container">
          <h1>${escapeHtml(title)}</h1>
          <p class="blog-lead">${escapeHtml(message)}</p>
          <p class="blog-message-links"><a href="/blog">ブログの記事一覧へ</a><a href="/">報告革命のトップへ</a></p>
        </div>
      </section>
      <div class="container blog-cta-wrap">${ctaBox()}</div>
    </main>`;
  return layout({ title: `${title}｜${BLOG_NAME}`, description: message, robots: "noindex, follow", body });
}

module.exports = { BLOG_DESCRIPTION, BLOG_NAME, formatDate, isoDay, relatedPosts, renderArticlePage, renderListPage, renderMessagePage };
