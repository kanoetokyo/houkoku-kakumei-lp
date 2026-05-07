const GOOGLE_FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSduvi0Z4rV3l6UjDHSUXcQYXYY8ejdm_ENMGYz5c4SUVSnWdQ/formResponse";

const FIELDS = [
  "entry.76457101",
  "entry.853312219",
  "entry.121044799",
  "entry.1490888909",
  "entry.749671614",
];

const REQUIRED_FIELDS = FIELDS.slice(0, 4);

async function readBody(req) {
  if (typeof req.body === "string") return req.body;

  if (req.body && typeof req.body === "object") {
    return new URLSearchParams(req.body).toString();
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  try {
    const params = new URLSearchParams(await readBody(req));
    const missing = REQUIRED_FIELDS.filter((field) => !params.get(field)?.trim());

    if (missing.length > 0) {
      sendJson(res, 400, { ok: false, message: "Required fields are missing" });
      return;
    }

    const googleParams = new URLSearchParams();
    FIELDS.forEach((field) => {
      googleParams.set(field, params.get(field)?.trim() || "");
    });
    googleParams.set("fvv", "1");
    googleParams.set("pageHistory", "0");

    const googleResponse = await fetch(GOOGLE_FORM_ACTION, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: googleParams.toString(),
    });

    if (!googleResponse.ok) {
      throw new Error(`Google Form responded with ${googleResponse.status}`);
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    sendJson(res, 502, { ok: false, message: "Failed to submit form" });
  }
};
