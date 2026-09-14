import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));

if (config.paused || config.postToEmail === false) {
  console.log("Email sending is off. Skipped.");
  process.exit(0);
}

const token = process.env.BUTTONDOWN_API_KEY;
if (!token) {
  console.log("BUTTONDOWN_API_KEY is not set. Email skipped.");
  process.exit(0);
}

const latestPath = path.join(root, "out", "latest.json");
if (!fs.existsSync(latestPath)) {
  console.log("No out/latest.json from this run. Nothing to send.");
  process.exit(0);
}

const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const mdPath = path.join(root, "src", "content", "posts", `${latest.slug}.md`);
if (!fs.existsSync(mdPath)) {
  console.error(`Missing post file ${mdPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(mdPath, "utf8");
const bodyMd = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
const origin = (process.env.SITE_URL || "https://www.sovereig.app").replace(/\/$/, "");
const image = `${origin}/og/${latest.slug}.jpg`;

const body = `<!-- buttondown-editor-mode: plaintext -->
# ${latest.title}

${latest.description}

![${latest.title}](${image})

${bodyMd}

[Read on the journal](${latest.url})
`;

const res = await fetch("https://api.buttondown.com/v1/emails", {
  method: "POST",
  headers: {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    subject: latest.title,
    body,
    status: "about_to_send",
    canonical_url: latest.url
  })
});

const text = await res.text();
if (!res.ok) {
  console.error(`Buttondown ${res.status}: ${text}`);
  process.exit(1);
}
console.log(`Queued Buttondown email for ${latest.slug}`);
