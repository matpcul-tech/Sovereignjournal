import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));

if (config.paused || !config.postToFacebook) {
  console.log("Facebook posting is off (config.paused or config.postToFacebook). Skipped.");
  process.exit(0);
}

const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const pageId = process.env.FACEBOOK_PAGE_ID;
const version = process.env.FACEBOOK_GRAPH_VERSION || "v23.0";
if (!token || !pageId) {
  console.log("FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID is not set. Facebook skipped.");
  process.exit(0);
}

const latestPath = path.join(root, "out", "latest.json");
const textPath = path.join(root, "out", "linkedin.txt");
if (!fs.existsSync(latestPath) || !fs.existsSync(textPath)) {
  console.log("No out/latest.json or out/linkedin.txt from this run. Nothing to post.");
  process.exit(0);
}

const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const message = fs.readFileSync(textPath, "utf8").trim();
const photoUrl = latest.slug
  ? `${(process.env.SITE_URL || new URL(latest.url).origin).replace(/\/$/, "")}/og/${latest.slug}.jpg`
  : null;

const graph = (p) => `https://graph.facebook.com/${version}${p}`;

async function postForm(endpoint, fields) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const res = await fetch(graph(endpoint), { method: "POST", body });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

const feed = await postForm(`/${pageId}/feed`, { message, link: latest.url });
if (feed.ok && feed.json.id) {
  console.log(`Posted to Facebook as a link card. Post id: ${feed.json.id}`);
  process.exit(0);
}

console.warn(`Facebook link post returned ${feed.status}: ${JSON.stringify(feed.json)}`);

if (photoUrl) {
  const photo = await postForm(`/${pageId}/photos`, {
    url: photoUrl,
    caption: message,
    published: "true"
  });
  if (photo.ok && (photo.json.id || photo.json.post_id)) {
    console.log(`Posted to Facebook as a photograph. Post id: ${photo.json.post_id || photo.json.id}`);
    process.exit(0);
  }
  console.error(`Facebook photo post returned ${photo.status}: ${JSON.stringify(photo.json)}`);
}

process.exit(1);
