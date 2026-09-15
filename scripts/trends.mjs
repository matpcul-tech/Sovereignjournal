import fs from "node:fs";
import path from "node:path";

const FEEDS = [
  {
    name: "sovereign-ai",
    url: "https://news.google.com/rss/search?q=%22sovereign+AI%22+OR+%22data+sovereignty%22+AI&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "rural-health",
    url: "https://news.google.com/rss/search?q=%22rural+health%22+AI+OR+%22rural+hospital%22+AI&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "tribal",
    url: "https://news.google.com/rss/search?q=tribal+(AI+OR+broadband+OR+energy+OR+%22data+sovereignty%22)&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "edge-health",
    url: "https://news.google.com/rss/search?q=%22edge+AI%22+(healthcare+OR+hospital+OR+clinic)&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "data-center",
    url: "https://news.google.com/rss/search?q=%22data+center%22+AI+(water+OR+energy+OR+rural)&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "clinical-ai",
    url: "https://news.google.com/rss/search?q=(HIPAA+OR+FDA+OR+ARPA-H)+AI+(health+OR+clinical)&hl=en-US&gl=US&ceid=US:en"
  },
  {
    name: "hn",
    url: "https://hnrss.org/frontpage"
  }
];

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return m ? decode(m[1]) : "";
}

function parseRss(xml) {
  return xml
    .split(/<item[\s>]/i)
    .slice(1)
    .map((block) => ({
      title: tag(block, "title"),
      link: tag(block, "link") || tag(block, "guid"),
      source: tag(block, "source") || "",
      pub: tag(block, "pubDate")
    }))
    .filter((i) => i.title && i.title.length > 18);
}

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "SovereignJournal/1.0 (+https://www.sovereig.app)" }
    });
    if (!res.ok) return [];
    return parseRss(await res.text())
      .slice(0, 8)
      .map((item) => ({ ...item, feed: feed.name }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreItem(item, theme) {
  const titleL = item.title.toLowerCase();
  const hay = new Set(tokenize(item.title + " " + item.source));
  const watch = theme.watch || [];
  let score = 0;
  for (const phrase of watch) {
    const p = phrase.toLowerCase();
    if (p.length > 4 && titleL.includes(p)) score += 5;
    else if (hay.has(p)) score += 2;
  }
  for (const word of tokenize(theme.title + " " + theme.angle)) {
    if (word.length > 5 && hay.has(word)) score += 1;
  }
  return score;
}

export async function gatherTrends(themes) {
  const lists = await Promise.all(FEEDS.map(fetchFeed));
  const seen = new Set();
  const items = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  const rankedThemes = themes
    .map((theme, index) => {
      const scored = items
        .map((item) => ({ item, score: scoreItem(item, theme) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      return {
        index,
        slug: theme.slug,
        title: theme.title,
        score: scored.slice(0, 5).reduce((sum, x) => sum + x.score, 0),
        headlines: scored.slice(0, 5).map((x) => ({
          title: x.item.title,
          source: x.item.source,
          pub: x.item.pub,
          link: x.item.link,
          score: x.score
        }))
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    gatheredAt: new Date().toISOString(),
    itemCount: items.length,
    rankedThemes,
    pool: items.slice(0, 16).map((i) => ({
      title: i.title,
      source: i.source,
      pub: i.pub,
      link: i.link,
      feed: i.feed
    }))
  };
}

export function pickTheme(themes, state, ranked) {
  const recent = new Set((state.written || []).slice(-4).map((w) => w.theme));
  const best = ranked[0];
  if (best && best.score >= 8 && !recent.has(best.title) && best.headlines.length) {
    return {
      theme: themes[best.index],
      reason: "trending",
      match: best
    };
  }
  const idx = (state.nextTheme || 0) % themes.length;
  const fallback = ranked.find((r) => r.index === idx) || { headlines: [], score: 0 };
  return {
    theme: themes[idx],
    reason: "rotation",
    match: fallback
  };
}

export function formatBriefing(choice, briefing) {
  const lines = [];
  const used = new Set();
  const add = (h) => {
    const key = (h.title || "").toLowerCase();
    if (!key || used.has(key)) return;
    used.add(key);
    const src = h.source ? " (" + h.source + ")" : "";
    lines.push("- " + h.title + src);
  };
  (choice.match.headlines || []).forEach(add);
  (briefing.pool || []).forEach(add);
  return lines.slice(0, 8).join("\n") || "- no reliable headlines this morning";
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === "trends.mjs";
if (isMain) {
  const root = process.cwd();
  const themes = JSON.parse(fs.readFileSync(path.join(root, "themes.json"), "utf8")).themes;
  const stateFile = path.join(root, "state.json");
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { nextTheme: 0, written: [] };
  const briefing = await gatherTrends(themes);
  const choice = pickTheme(themes, state, briefing.rankedThemes);
  const outDir = path.join(root, "out");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "trends.json"), JSON.stringify({ briefing, choice: { slug: choice.theme.slug, reason: choice.reason, score: choice.match.score } }, null, 2) + "\n");
  console.log("Picked " + choice.theme.title + " via " + choice.reason + " (score " + choice.match.score + ")");
  console.log(formatBriefing(choice, briefing));
}
