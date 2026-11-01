"use strict";

// Notion のブロックを記事本文の HTML にする。
const { imageProxyUrl } = require("./notion");

const SITE_ORIGIN = "https://hokokukakumei.com";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isNotionUrl(href) {
  return /^https?:\/\/([\w-]+\.)?(notion\.so|notion\.site|notion\.com)\//.test(href);
}

function linkHtml(href, inner) {
  if (href.startsWith("/") || href.startsWith(`${SITE_ORIGIN}/`) || href === SITE_ORIGIN) {
    const path = href.startsWith(SITE_ORIGIN) ? href.slice(SITE_ORIGIN.length) || "/" : href;
    return `<a href="${escapeHtml(path)}">${inner}</a>`;
  }
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${inner}</a>`;
}

function richTextToHtml(richText) {
  return (richText || [])
    .map((item) => {
      let text = escapeHtml(item.plain_text).replace(/\n/g, "<br />");
      const ann = item.annotations || {};
      if (ann.code) text = `<code>${text}</code>`;
      if (ann.bold) text = `<strong>${text}</strong>`;
      if (ann.italic) text = `<em>${text}</em>`;
      if (ann.strikethrough) text = `<del>${text}</del>`;
      if (ann.underline) text = `<u>${text}</u>`;
      // Notion 内のページへのリンクは公開されていないので文字だけにする
      if (item.href && !isNotionUrl(item.href)) text = linkHtml(item.href, text);
      return text;
    })
    .join("");
}

function plainText(richText) {
  return (richText || []).map((item) => item.plain_text).join("");
}

function imageSource(block) {
  const image = block.image;
  if (image.type === "external" && /^https:\/\//.test(image.external.url)) return image.external.url;
  return imageProxyUrl(block.id);
}

// 記事本文を HTML にする。目次用に h2 の一覧も返す。
function blocksToHtml(blocks, { skipImageId = "" } = {}) {
  const headings = [];
  let headingCount = 0;

  function heading(block, level) {
    const text = block[block.type].rich_text;
    headingCount += 1;
    const id = `sec-${headingCount}`;
    if (level === 2) headings.push({ id, text: plainText(text) });
    return `<h${level} id="${id}">${richTextToHtml(text)}</h${level}>`;
  }

  function children(block) {
    return block.children && block.children.length ? render(block.children) : "";
  }

  function renderBlock(block) {
    const value = block[block.type] || {};
    switch (block.type) {
      case "paragraph": {
        const inner = richTextToHtml(value.rich_text);
        return (inner ? `<p>${inner}</p>` : "") + children(block);
      }
      case "heading_1":
      case "heading_2":
        return heading(block, 2);
      case "heading_3":
        return heading(block, 3);
      case "quote":
        return `<blockquote><p>${richTextToHtml(value.rich_text)}</p>${children(block)}</blockquote>`;
      case "callout": {
        const icon = value.icon && value.icon.type === "emoji" ? `<span class="post-callout-icon" aria-hidden="true">${escapeHtml(value.icon.emoji)}</span>` : "";
        return `<div class="post-callout">${icon}<div><p>${richTextToHtml(value.rich_text)}</p>${children(block)}</div></div>`;
      }
      case "divider":
        return "<hr />";
      case "image": {
        if (block.id === skipImageId) return "";
        const caption = plainText(value.caption);
        const captionHtml = caption ? `<figcaption>${richTextToHtml(value.caption)}</figcaption>` : "";
        return `<figure class="post-figure"><img src="${escapeHtml(imageSource(block))}" alt="${escapeHtml(caption || "記事の図解")}" loading="lazy" decoding="async" />${captionHtml}</figure>`;
      }
      case "toggle":
        return `<details class="post-toggle"><summary>${richTextToHtml(value.rich_text)}</summary>${children(block)}</details>`;
      case "code":
        return `<pre class="post-code"><code>${escapeHtml(plainText(value.rich_text))}</code></pre>`;
      case "bookmark":
      case "embed":
      case "link_preview": {
        if (!value.url || isNotionUrl(value.url)) return "";
        const label = plainText(value.caption) || value.url;
        return `<p class="post-link">${linkHtml(value.url, escapeHtml(label))}</p>`;
      }
      case "table": {
        const rows = (block.children || []).filter((row) => row.type === "table_row");
        const body = rows
          .map((row, index) => {
            const tag = index === 0 && value.has_column_header ? "th" : "td";
            return `<tr>${row.table_row.cells.map((cell) => `<${tag}>${richTextToHtml(cell)}</${tag}>`).join("")}</tr>`;
          })
          .join("");
        return `<div class="post-table"><table>${body}</table></div>`;
      }
      case "column_list":
      case "column":
      case "synced_block":
        return children(block);
      default:
        return "";
    }
  }

  function render(list) {
    const parts = [];
    let openList = null;
    for (const block of list) {
      const listTag = block.type === "bulleted_list_item" ? "ul" : block.type === "numbered_list_item" ? "ol" : null;
      if (openList && listTag !== openList) {
        parts.push(`</${openList}>`);
        openList = null;
      }
      if (listTag) {
        if (!openList) {
          parts.push(`<${listTag}>`);
          openList = listTag;
        }
        parts.push(`<li>${richTextToHtml(block[block.type].rich_text)}${children(block)}</li>`);
        continue;
      }
      parts.push(renderBlock(block));
    }
    if (openList) parts.push(`</${openList}>`);
    return parts.join("");
  }

  return { html: render(blocks), headings };
}

module.exports = { SITE_ORIGIN, blocksToHtml, escapeHtml, richTextToHtml };
