import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));

if (config.paused || !config.postToLinkedIn) {
  console.log("LinkedIn posting is off (config.paused or config.postToLinkedIn). Skipped.");
  process.exit(0);
}

const token = process.env.LINKEDIN_ACCESS_TOKEN;
const author = process.env.LINKEDIN_AUTHOR_URN;
const version = process.env.LINKEDIN_VERSION || "202608";
if (!token || !author) {
  console.error("Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN. See README, section LinkedIn.");
  process.exit(1);
}

const latestPath = path.join(root, "out", "latest.json");
const textPath = path.join(root, "out", "linkedin.txt");
if (!fs.existsSync(latestPath) || !fs.existsSync(textPath)) {
  console.log("No out/latest.json or out/linkedin.txt from this run. Nothing to post.");
  process.exit(0);
}

const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const text = fs.readFileSync(textPath, "utf8").trim();
const headers = {
  Authorization: `Bearer ${token}`,
  "X-Restli-Protocol-Version": "2.0.0",
  "LinkedIn-Version": version
};

const escapeCommentary = (s) => s.replace(/[()<>\[\]{}*_~|@]/g, (c) => "\\" + c);

async function uploadThumbnail(slug) {
  const file = path.join(root, "public", "og", `${slug}.png`);
  if (!fs.existsSync(file)) {
    console.warn(`No OG card at ${file}. Article will post without a thumbnail.`);
    return null;
  }
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner: author } })
  });
  if (!init.ok) {
    console.error(`LinkedIn image init ${init.status}: ${await init.text()}`);
    return null;
  }
  const payload = await init.json();
  const value = payload.value || payload;
  const uploadUrl = value.uploadUrl;
  const imageUrn = value.image;
  if (!uploadUrl || !imageUrn) {
    console.error("LinkedIn image init missing uploadUrl or image URN.", payload);
    return null;
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
    body: fs.readFileSync(file)
  });
  if (!put.ok) {
    console.error(`LinkedIn image upload ${put.status}: ${await put.text()}`);
    return null;
  }
  return imageUrn;
}

const thumbnail = latest.slug ? await uploadThumbnail(latest.slug) : null;

const article = {
  source: latest.url,
  title: latest.title.slice(0, 200),
  description: latest.description.slice(0, 250)
};
if (thumbnail) article.thumbnail = thumbnail;

const body = {
  author,
  commentary: escapeCommentary(text),
  visibility: "PUBLIC",
  distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
  content: { article },
  lifecycleState: "PUBLISHED",
  isReshareDisabledByAuthor: false
};

const res = await fetch("https://api.linkedin.com/rest/posts", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

if (res.status === 401 || res.status === 403) {
  console.error(`LinkedIn returned ${res.status}. The access token has probably expired (they last about 60 days). Re-authorize and update the LINKEDIN_ACCESS_TOKEN secret. See README.`);
  console.error(await res.text());
  process.exit(1);
}
if (!res.ok) {
  console.error(`LinkedIn returned ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

console.log(`Posted to LinkedIn. Post id: ${res.headers.get("x-restli-id") || "(not returned)"}${thumbnail ? " with thumbnail" : ""}`);
