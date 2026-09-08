import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import config from "../../config.json";

export async function GET(context) {
  const posts = (await getCollection("posts")).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return rss({
    title: config.siteTitle,
    description: "Daily writing on sovereign AI infrastructure and Adaptive Inclusive Leadership Theory.",
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/posts/${p.id}/`
    }))
  });
}
