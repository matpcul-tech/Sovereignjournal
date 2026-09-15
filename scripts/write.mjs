import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { formatBriefing, gatherTrends, pickTheme } from "./trends.mjs";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const themesFile = JSON.parse(fs.readFileSync(path.join(root, "themes.json"), "utf8"));
const postsDir = path.join(root, "src", "content", "posts");
const outDir = path.join(root, "out");
const stateFile = path.join(root, "state.json");

if (config.paused) {
  console.log("config.paused is true. Nothing written.");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const existing = fs.readdirSync(postsDir).filter((f) => f.startsWith(today));
if (existing.length && !process.argv.includes("--force")) {
  console.log(`A post for ${today} already exists (${existing[0]}). Use --force to write another.`);
  process.exit(0);
}

const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { nextTheme: 0, written: [] };
const themes = themesFile.themes;

let briefing = { rankedThemes: [], pool: [], itemCount: 0, gatheredAt: new Date().toISOString() };
try {
  briefing = await gatherTrends(themes);
} catch (err) {
  console.warn("Trend gather failed, falling back to rotation:", err.message);
}

const choice = pickTheme(themes, state, briefing.rankedThemes || []);
const theme = choice.theme;
const briefingText = formatBriefing(choice, briefing);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "trends.json"),
  JSON.stringify(
    {
      gatheredAt: briefing.gatheredAt,
      itemCount: briefing.itemCount,
      picked: { slug: theme.slug, title: theme.title, reason: choice.reason, score: choice.match.score || 0 },
      headlines: choice.match.headlines || []
    },
    null,
    2
  ) + "\n"
);

console.log(`Briefing: ${briefing.itemCount || 0} headlines. Picked ${theme.title} via ${choice.reason} (score ${choice.match.score || 0}).`);

const researchDir = path.join(root, "research");
const voice = fs.readFileSync(path.join(researchDir, "voice.md"), "utf8");
const research = theme.research
  .map((f) => {
    const p = path.join(researchDir, f);
    return fs.existsSync(p) ? `<file name="${f}">\n${fs.readFileSync(p, "utf8")}\n</file>` : "";
  })
  .filter(Boolean)
  .join("\n\n");

const recentTitles = state.written.slice(-14).map((w) => `- ${w.date}: ${w.title}`).join("\n") || "- none yet";
const leadHeadline = (choice.match.headlines && choice.match.headlines[0] && choice.match.headlines[0].title) || "";

const system = `You write a daily journal entry for ${config.author}. ${config.authorLine}

The journal covers sovereign AI infrastructure and Adaptive Inclusive Leadership Theory (AILT). It publishes to a blog, LinkedIn, and email.

Follow the voice guide exactly. It is the law of this journal.

<voice_guide>
${voice}
</voice_guide>

Hard rules:
- Never use an em dash or en dash character anywhere. Not in the title, not in the body, not in the LinkedIn cut.
- Never invent facts, numbers, quotes, names, or events. You may use a headline from today's briefing as a public news hook. Quote it as news, not as something you witnessed. If a specific number is not in the research or in the briefing line, do not use one.
- Do not mention investors, valuations, fundraising, or private individuals.
- The reader is a leader, builder, or policy person who has never heard of AILT. Teach them one thing well.
- Do not restate the theme title as the opening line.
- Do not become a news recap. The briefing is the door. The piece is the room.

Hook rules (non-negotiable):
- Title is a hook, under 70 characters, sentence case. Concrete nouns (clinic, rack, keys, county, water, bill). Not a theme label.
- First sentence of the body lands on a specific current fact from the briefing, or a concrete scene from Ada, a node, or a clinic. Never a principle. Never "In leadership..."
- If the briefing has a usable headline, open on that fact in your own words, then turn to the idea. Name the source in passing only if it helps trust (STAT, ARPA-H, a hospital system). Do not footnote.
- LinkedIn first line is the hook, 12 words or fewer if you can, no hashtags, no greeting.

Return only a JSON object with these keys and nothing else, no markdown fences:
{
  "title": "post title, under 70 characters, sentence case",
  "description": "one sentence, under 160 characters, for the blog listing and meta tag",
  "tags": ["three", "to", "five", "lowercase", "tags"],
  "body": "the full piece in markdown, 700 to 1100 words, using ## subheads only if the piece genuinely has sections. No H1. No title repeated at the top.",
  "linkedin": "a standalone LinkedIn post, under ${config.linkedInMaxChars} characters, plain text, no markdown, no hashtags in the first line, first line is the hook, short paragraphs separated by blank lines, no URL (the article card carries the link), then up to four hashtags on the last line"
}`;

const user = `Today's theme: ${theme.title}
Angle: ${theme.angle}
Why this theme today: ${choice.reason}${leadHeadline ? `. Strongest headline: ${leadHeadline}` : ""}

Today's briefing (use one item as the hook if it honestly fits; ignore the rest):
${briefingText}

Recent entries (do not repeat their titles or their central claim):
${recentTitles}

Research files for this theme:
${research}

Write today's entry. Make a person stop scrolling.` ;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

console.log(`Writing: ${theme.title} (${model})`);
const response = await client.messages.create({
  model,
  max_tokens: 4000,
  system,
  messages: [{ role: "user", content: user }]
});

const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
let post;
try {
  post = JSON.parse(cleaned);
} catch (err) {
  fs.writeFileSync(path.join(outDir, "last-raw.txt"), raw);
  throw new Error("Model did not return valid JSON. Raw output saved to out/last-raw.txt");
}

const stripDashes = (s) => String(s).replace(/\u2014|\u2013/g, ", ").replace(/\s+,/g, ",");
for (const k of ["title", "description", "body", "linkedin"]) post[k] = stripDashes(post[k]);
post.tags = (post.tags || []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, ""));

const slug = `${today}-${theme.slug}`;
const yamlStr = (s) => JSON.stringify(String(s));
const frontmatter = `---\ntitle: ${yamlStr(post.title)}\ndescription: ${yamlStr(post.description)}\ndate: ${today}\ntheme: ${yamlStr(theme.title)}\ntags: [${post.tags.map(yamlStr).join(", ")}]\n---\n`;

fs.writeFileSync(path.join(postsDir, `${slug}.md`), frontmatter + "\n" + post.body.trim() + "\n");

const siteUrl = (process.env.SITE_URL || "https://www.sovereig.app").replace(/\/$/, "");
const postUrl = `${siteUrl}/posts/${slug}/`;
fs.writeFileSync(path.join(outDir, "linkedin.txt"), post.linkedin.trim());
fs.writeFileSync(
  path.join(outDir, "latest.json"),
  JSON.stringify({ slug, title: post.title, description: post.description, url: postUrl, date: today }, null, 2)
);

if (choice.reason === "rotation") {
  state.nextTheme = (state.nextTheme + 1) % themes.length;
}
state.written.push({
  date: today,
  slug,
  title: post.title,
  theme: theme.title,
  reason: choice.reason,
  hook: leadHeadline || ""
});
state.written = state.written.slice(-60);
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

console.log(`Wrote src/content/posts/${slug}.md`);
console.log(`Post URL: ${postUrl}`);
