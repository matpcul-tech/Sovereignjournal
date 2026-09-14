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

const postsDir = path.join(root, "src", "content", "posts");
const origin = (process.env.SITE_URL || "https://www.sovereig.app").replace(/\/$/, "");
const outDir = path.join(root, "out");

function unquote(value) {
  const s = String(value || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return JSON.parse(s.startsWith("'") ? '"' + s.slice(1, -1) + '"' : s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fields = {};
  if (match) {
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      fields[line.slice(0, idx).trim()] = unquote(line.slice(idx + 1));
    }
  }
  return {
    fields,
    body: raw.replace(/^[\s\S]*?\n---\s*/, "").trim()
  };
}

function loadLatest() {
  const latestPath = path.join(outDir, "latest.json");
  if (fs.existsSync(latestPath)) {
    return JSON.parse(fs.readFileSync(latestPath, "utf8"));
  }

  const today = new Date().toISOString().slice(0, 10);
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md")).sort();
  const todays = files.filter((f) => f.startsWith(today));
  const dated = files.filter((f) => f !== ".gitkeep");
  const file = todays[0] || dated[dated.length - 1];
  if (!file) {
    console.log("No journal entry to email.");
    process.exit(0);
  }

  const slug = file.replace(/\.md$/, "");
  const parsed = parseFrontmatter(fs.readFileSync(path.join(postsDir, file), "utf8"));
  return {
    slug,
    title: parsed.fields.title || slug,
    description: parsed.fields.description || "",
    url: origin + "/posts/" + slug + "/",
    date: parsed.fields.date || slug.slice(0, 10)
  };
}

const latest = loadLatest();
const mdPath = path.join(postsDir, latest.slug + ".md");
if (!fs.existsSync(mdPath)) {
  console.error("Missing post file " + mdPath);
  process.exit(1);
}

const { body: bodyMd } = parseFrontmatter(fs.readFileSync(mdPath, "utf8"));
const image = origin + "/og/" + latest.slug + ".jpg";
const postUrl = latest.url || origin + "/posts/" + latest.slug + "/";

const body =
  "<!-- buttondown-editor-mode: plaintext -->\n" +
  "# " + latest.title + "\n\n" +
  latest.description + "\n\n" +
  "![" + latest.title + "](" + image + ")\n\n" +
  bodyMd + "\n\n" +
  "[Read on the journal](" + postUrl + ")\n";

const res = await fetch("https://api.buttondown.com/v1/emails", {
  method: "POST",
  headers: {
    Authorization: "Token " + token,
    "Content-Type": "application/json",
    "X-API-Version": "2026-04-01",
    "X-Buttondown-Live-Dangerously": "true"
  },
  body: JSON.stringify({
    subject: latest.title,
    body,
    status: "about_to_send",
    canonical_url: postUrl
  })
});

const text = await res.text();
if (!res.ok) {
  console.error("Buttondown " + res.status + ": " + text);
  process.exit(1);
}
console.log("Queued Buttondown email for " + latest.slug);
