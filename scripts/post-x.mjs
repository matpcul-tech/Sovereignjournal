import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));

if (config.paused || !config.postToX) {
  console.log("X posting is off (config.paused or config.postToX). Skipped.");
  process.exit(0);
}

const keys = {
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET
};
if (!keys.apiKey || !keys.apiSecret || !keys.accessToken || !keys.accessSecret) {
  console.log("X API keys are not set. X skipped.");
  process.exit(0);
}

const latestPath = path.join(root, "out", "latest.json");
const textPath = path.join(root, "out", "linkedin.txt");
if (!fs.existsSync(latestPath) || !fs.existsSync(textPath)) {
  console.log("No out/latest.json or out/linkedin.txt from this run. Nothing to post.");
  process.exit(0);
}

const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const longCut = fs.readFileSync(textPath, "utf8").trim();
const photo = latest.slug ? path.join(root, "public", "og", `${latest.slug}.jpg`) : null;

function pct(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthHeader(method, url, extra = {}) {
  const oauth = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: "1.0"
  };
  const params = { ...extra, ...oauth };
  const base = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  const sigBase = `${method.toUpperCase()}&${pct(url)}&${pct(base)}`;
  const signingKey = `${pct(keys.apiSecret)}&${pct(keys.accessSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(sigBase).digest("base64");
  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
      .join(", ")
  );
}

function tweetText() {
  const url = latest.url || "";
  const reserve = url ? 24 : 0;
  const budget = 280 - reserve;
  let body = longCut
    .split(/\n+/)
    .filter((line) => line.trim() && !/^#\w/.test(line.trim()))
    .slice(0, 2)
    .join("\n\n")
    .trim();
  if (body.length > budget) {
    body = body.slice(0, Math.max(0, budget - 1)).replace(/\s+\S*$/, "").trimEnd() + "…";
  }
  return url ? `${body}\n${url}` : body;
}

async function uploadPhoto() {
  if (!photo || !fs.existsSync(photo)) return null;
  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const form = new FormData();
  form.append("media_category", "tweet_image");
  form.append("media", new Blob([fs.readFileSync(photo)], { type: "image/jpeg" }), path.basename(photo));
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader("POST", url) },
    body: form
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.media_id_string) {
    console.warn(`X media upload ${res.status}: ${JSON.stringify(json)}`);
    return null;
  }
  return json.media_id_string;
}

const mediaId = await uploadPhoto();
const payload = { text: tweetText() };
if (mediaId) payload.media = { media_ids: [mediaId] };

const tweetUrl = "https://api.x.com/2/tweets";
const res = await fetch(tweetUrl, {
  method: "POST",
  headers: {
    Authorization: oauthHeader("POST", tweetUrl),
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});
const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`X returned ${res.status}: ${JSON.stringify(json)}`);
  process.exit(1);
}
console.log(`Posted to X. Tweet id: ${json.data?.id || "(not returned)"}${mediaId ? " with photograph" : ""}`);
