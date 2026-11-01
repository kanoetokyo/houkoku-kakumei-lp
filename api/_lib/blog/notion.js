"use strict";

// Notion の「ブログ記事 (blogs)」データソースから記事を読む。
// プロパティ名・公開条件・キャッシュはカノエのおそうじノートと同じ仕様。

const DEFAULT_DATA_SOURCE_ID = "baf206f0-c83f-480f-b08d-ee04b6274ffb";
const CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_AUTHOR = "報告革命 編集部";
const MAX_DEPTH = 2;

function getPropText(prop) {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t) => t.plain_text).join("");
    case "rich_text":
      return (prop.rich_text || []).map((t) => t.plain_text).join("");
    case "select":
      return prop.select ? prop.select.name : "";
    case "status":
      return prop.status ? prop.status.name : "";
    case "multi_select":
      return (prop.multi_select || []).map((s) => s.name).join(",");
    case "date":
      return prop.date ? prop.date.start : "";
    case "url":
      return prop.url || "";
    default:
      return "";
  }
}

function getPropList(prop) {
  return getPropText(prop)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// Markdown の太字記法（**）が混ざったタイトル・slug を整える
function cleanText(value) {
  return value.trim().replace(/^\*\*|\*\*$/g, "").trim();
}

// 予約記事は published_at を過ぎたら公開する。日付だけなら UTC 0時＝日本時間 9:00。
function isScheduledPostDue(publishedAt, now = Date.now()) {
  const time = Date.parse(publishedAt);
  return !Number.isNaN(time) && time <= now;
}

function pageToPost(page, now = Date.now()) {
  const props = page && page.properties;
  if (!props) return null;

  const title = cleanText(getPropText(props.title));
  const slug = cleanText(getPropText(props.slug));
  if (!title || !slug) return null;

  const rawStatus = getPropText(props.status);
  const publishedAt = getPropText(props.published_at) || page.created_time || "";
  const isDue = rawStatus === "scheduled" && isScheduledPostDue(publishedAt, now);
  const categorySlugs = getPropList(props.category_slug);
  const categoryNames = getPropList(props.category_name);

  return {
    id: page.id,
    title,
    slug,
    summary: cleanText(getPropText(props.summary)),
    categories: categorySlugs.map((categorySlug, index) => ({
      slug: categorySlug,
      name: categoryNames[index] || categorySlug,
    })),
    authorName: getPropText(props.author_name) || DEFAULT_AUTHOR,
    thumbnailUrl: getPropText(props.thumbnail_url),
    publishedAt,
    updatedAt: page.last_edited_time || page.created_time || publishedAt,
    status: isDue ? "published" : rawStatus || "draft",
  };
}

// 同じ slug が複数あるときは公開日時が新しいほうを残す（予約での差し替え用）
function latestBySlug(posts) {
  const bySlug = new Map();
  for (const post of posts) {
    const current = bySlug.get(post.slug);
    if (!current || Date.parse(post.publishedAt) > Date.parse(current.publishedAt)) {
      bySlug.set(post.slug, post);
    }
  }
  return [...bySlug.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function imageProxyUrl(blockId) {
  return `/api/notion-image?id=${encodeURIComponent(blockId)}`;
}

function createBlogStore({ client, dataSourceId = DEFAULT_DATA_SOURCE_ID, now = () => Date.now(), cacheTtl = CACHE_TTL }) {
  const cache = new Map();

  // 期限内はキャッシュを返し、Notion が落ちているときは直前の正常値を返す
  async function cached(key, load) {
    const entry = cache.get(key);
    if (entry && now() - entry.time < cacheTtl) return entry.value;
    try {
      const value = await load();
      cache.set(key, { value, time: now() });
      return value;
    } catch (error) {
      if (entry) return entry.value;
      throw error;
    }
  }

  async function listChildren(blockId) {
    const blocks = [];
    let cursor;
    do {
      const response = await client.blocks.children.list({
        block_id: blockId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      blocks.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
    return blocks;
  }

  async function loadBlocks(blockId, depth = 0) {
    const blocks = await listChildren(blockId);
    if (depth >= MAX_DEPTH) return blocks;
    for (const block of blocks) {
      if (block.has_children) block.children = await loadBlocks(block.id, depth + 1);
    }
    return blocks;
  }

  async function firstImageUrl(pageId) {
    const response = await client.blocks.children.list({ block_id: pageId, page_size: 100 });
    const image = response.results.find((block) => block.type === "image");
    return image ? imageProxyUrl(image.id) : "";
  }

  async function queryPages() {
    const pages = [];
    let cursor;
    const statusIs = (value) => ({ property: "status", select: { equals: value } });
    do {
      const response = await client.dataSources.query({
        data_source_id: dataSourceId,
        filter: { or: [statusIs("published"), statusIs("scheduled")] },
        sorts: [{ property: "published_at", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  function listPosts() {
    return cached("posts", async () => {
      const time = now();
      const posts = latestBySlug(
        (await queryPages()).map((page) => pageToPost(page, time)).filter((post) => post && post.status === "published"),
      );
      for (const post of posts) {
        if (!post.thumbnailUrl) post.thumbnailUrl = await firstImageUrl(post.id).catch(() => "");
      }
      return posts;
    });
  }

  async function getPost(slug) {
    const post = (await listPosts()).find((item) => item.slug === slug);
    if (!post) return null;
    const blocks = await cached(`blocks:${post.id}:${post.updatedAt}`, () => loadBlocks(post.id));
    return { post, blocks };
  }

  async function getImageUrl(blockId) {
    const block = await client.blocks.retrieve({ block_id: blockId });
    if (block.type !== "image") return "";
    const image = block.image;
    return image.type === "file" ? image.file.url : image.external.url;
  }

  return { listPosts, getPost, getImageUrl };
}

// 環境変数から Notion クライアントを作る。キーがなければ null（ブログは準備中として表示）。
let envStore;
function getStoreFromEnv() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) return null;
  if (!envStore) {
    const { Client } = require("@notionhq/client");
    envStore = createBlogStore({
      client: new Client({ auth: apiKey }),
      dataSourceId: process.env.NOTION_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE_ID,
    });
  }
  return envStore;
}

module.exports = {
  DEFAULT_AUTHOR,
  DEFAULT_DATA_SOURCE_ID,
  createBlogStore,
  getStoreFromEnv,
  imageProxyUrl,
  isScheduledPostDue,
  latestBySlug,
  pageToPost,
};
