// Prime Marketing Planner — reads what Prime published on YouTube and Facebook.
// Runs on Vercel. Keys live in Vercel › Settings › Environment Variables, never in the web page:
//   FIREBASE_WEB_API_KEY   same apiKey as in config.js (used to check the caller is signed in to the planner)
//   YOUTUBE_API_KEY        Google Cloud API key with "YouTube Data API v3" enabled
//   YOUTUBE_CHANNEL_ID     Prime's channel ID (starts with UC…)
//   META_PAGE_ID           Prime's Facebook Page ID            (optional until the Meta setup is done)
//   META_PAGE_TOKEN        long-lived Page access token        (optional until the Meta setup is done)
//   META_API_VERSION       optional, defaults to v23.0
// Returns only post dates, formats, titles and links; no inbox, no personal data.

const SHORT_MAX_SECONDS = 180; // YouTube Shorts can run up to 3 minutes

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && (j.error.message || j.error.errors?.[0]?.message)) || `HTTP ${r.status}`);
  return j;
}

function isoSeconds(d) { // PT1H2M3S → seconds
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || "") || [];
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

async function signedIn(req) {
  const key = process.env.FIREBASE_WEB_API_KEY;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!key || !token) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return j.users && j.users[0] ? (j.users[0].email || "user") : null;
}

async function youtube(since) {
  const key = process.env.YOUTUBE_API_KEY, channel = process.env.YOUTUBE_CHANNEL_ID;
  if (!key || !channel) return { configured: false, items: [] };
  const base = "https://www.googleapis.com/youtube/v3/";
  const ch = await getJSON(`${base}channels?part=contentDetails,statistics&id=${encodeURIComponent(channel)}&key=${key}`);
  const stats = ch.items?.[0]?.statistics || {};
  const subscribers = stats.hiddenSubscriberCount ? null : (stats.subscriberCount != null ? +stats.subscriberCount : null);
  if (!ch.items?.length) throw new Error("YouTube channel not found. Check YOUTUBE_CHANNEL_ID (it starts with UC).");
  const uploads = ch.items[0].contentDetails?.relatedPlaylists?.uploads;
  const ids = new Set();
  let viaPlaylist = !!uploads;
  if (viaPlaylist) {
    let page = "", guard = 0;
    try {
      do {
        const r = await getJSON(`${base}playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&key=${key}${page ? `&pageToken=${page}` : ""}`);
        let older = 0;
        for (const it of r.items || []) {
          const at = it.contentDetails?.videoPublishedAt;
          if (!at) continue;
          if (at.slice(0, 10) < since) { older++; continue; }
          ids.add(it.contentDetails.videoId);
        }
        page = older ? "" : r.nextPageToken; // uploads are listed newest first: stop at the first video older than `since`
      } while (page && ++guard < 10);
    } catch (e) {
      if (!/cannot be found|playlistNotFound|not found/i.test(String(e.message))) throw e;
      viaPlaylist = false; // YouTube has no uploads list for this channel (e.g. no public videos yet): search instead
    }
  }
  if (!viaPlaylist) {
    let page = "", guard = 0;
    const after = new Date(since + "T00:00:00+08:00").toISOString();
    do {
      const r = await getJSON(`${base}search?part=id&type=video&order=date&maxResults=50&channelId=${encodeURIComponent(channel)}&publishedAfter=${encodeURIComponent(after)}&key=${key}${page ? `&pageToken=${page}` : ""}`);
      for (const it of r.items || []) if (it.id?.videoId) ids.add(it.id.videoId);
      page = r.nextPageToken;
    } while (page && ++guard < 4);
  }
  const items = [], list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const v = await getJSON(`${base}videos?part=contentDetails,snippet,statistics,status&id=${list.slice(i, i + 50).join(",")}&key=${key}`);
    for (const x of v.items || []) {
      if (x.status?.privacyStatus !== "public") continue;
      if (x.snippet?.liveBroadcastContent === "upcoming") continue;
      const seconds = isoSeconds(x.contentDetails?.duration);
      items.push({ platform: "youtube", id: x.id, at: x.snippet.publishedAt, format: seconds > SHORT_MAX_SECONDS ? "longform" : "short",
        title: x.snippet.title || "", url: `https://www.youtube.com/watch?v=${x.id}`, seconds, views: +(x.statistics?.viewCount || 0) });
    }
  }
  return { configured: true, items, subscribers };
}

async function facebook(since) {
  const page = process.env.META_PAGE_ID, token = process.env.META_PAGE_TOKEN;
  if (!page || !token) return { configured: false, items: [] };
  const g = `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}/`;
  const sinceUnix = Math.floor(new Date(since + "T00:00:00+08:00").getTime() / 1000);
  async function all(path, fields) {
    const out = []; let url = `${g}${page}/${path}?fields=${fields}&since=${sinceUnix}&limit=100&access_token=${encodeURIComponent(token)}`, guard = 0;
    while (url && guard++ < 10) {
      const r = await getJSON(url);
      out.push(...(r.data || []));
      const last = r.data?.[r.data.length - 1];
      url = r.paging?.next && last && String(last.created_time || "").slice(0, 10) >= since ? r.paging.next : "";
    }
    return out.filter(x => String(x.created_time || "").slice(0, 10) >= since);
  }
  const items = [], seen = new Set();
  const reels = await all("video_reels", "id,created_time,description,permalink_url");
  for (const x of reels) {
    seen.add(String(x.id));
    items.push({ platform: "facebook", id: String(x.id), at: x.created_time, format: "reel", title: x.description || "",
      url: x.permalink_url ? (x.permalink_url.startsWith("http") ? x.permalink_url : "https://www.facebook.com" + x.permalink_url) : `https://www.facebook.com/reel/${x.id}` });
  }
  const videos = await all("videos", "id,created_time,title,description,permalink_url,length");
  for (const x of videos) {
    const link = String(x.permalink_url || "");
    if (seen.has(String(x.id)) || link.includes("/reel/")) continue;
    seen.add(String(x.id));
    items.push({ platform: "facebook", id: String(x.id), at: x.created_time, format: "video", title: x.title || x.description || "", seconds: x.length || 0,
      url: link ? (link.startsWith("http") ? link : "https://www.facebook.com" + link) : `https://www.facebook.com/watch/?v=${x.id}` });
  }
  const posts = await all("published_posts", "id,created_time,message,permalink_url,attachments{media_type,target{id}}");
  for (const x of posts) {
    const att = x.attachments?.data?.[0] || {}, type = String(att.media_type || "").toLowerCase();
    if (type !== "photo" && type !== "album") continue; // videos and reels are counted above; text and link posts are skipped
    items.push({ platform: "facebook", id: String(x.id), at: x.created_time, format: "photo", title: x.message || "", url: x.permalink_url || `https://www.facebook.com/${x.id}` });
  }
  return { configured: true, items };
}

// Page insights by month (Manila time): views, engagement, and followers at month end.
// Meta renamed several Page metrics in late 2025, so each figure tries the current name first, then the older one.
const INSIGHT_METRICS = {
  views:      ["page_media_view", "page_impressions"],
  engagement: ["page_post_engagements"],
  followers:  ["page_follows", "page_fans"],          // lifetime totals per day; month end = last value
};
async function facebookInsights(since) {
  const page = process.env.META_PAGE_ID, token = process.env.META_PAGE_TOKEN;
  if (!page || !token) return { configured: false };
  const g = `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}/`;
  const start = new Date(since + "T00:00:00+08:00").getTime() / 1000, end = Math.floor(Date.now() / 1000);
  const dayOf = endTime => new Date(new Date(endTime).getTime() - 12 * 3600e3).toISOString().slice(0, 10); // value ending at end_time belongs to the day before
  const months = {}, used = {}, errors = {};
  for (const [key, names] of Object.entries(INSIGHT_METRICS)) {
    for (const metric of names) {
      try {
        const values = [];
        for (let s = start; s < end; s += 89 * 86400) { // Meta allows about 90 days per request
          const u = Math.min(end, s + 89 * 86400);
          const r = await getJSON(`${g}${page}/insights?metric=${metric}&period=day&since=${Math.floor(s)}&until=${u}&access_token=${encodeURIComponent(token)}`);
          values.push(...(r.data?.[0]?.values || []));
        }
        if (!values.length) throw new Error("no data returned");
        for (const v of values) {
          const d = dayOf(v.end_time), m = d.slice(0, 7), n = typeof v.value === "number" ? v.value : 0;
          months[m] = months[m] || {};
          if (key === "followers") { if (!months[m]._fd || d >= months[m]._fd) { months[m].followers = n; months[m]._fd = d; } }
          else months[m][key] = (months[m][key] || 0) + n;
        }
        used[key] = metric; delete errors[key]; break;
      } catch (e) { errors[key] = `${metric}: ${String(e.message || e).slice(0, 140)}`; }
    }
  }
  // Fallback for followers: the page's current follower count, for this month only
  if (!used.followers) {
    try { const p = await getJSON(`${g}${page}?fields=followers_count&access_token=${encodeURIComponent(token)}`);
      if (typeof p.followers_count === "number") { const m = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7); months[m] = months[m] || {}; months[m].followers = p.followers_count; used.followers = "followers_count"; delete errors.followers; }
    } catch (e) {}
  }
  for (const m of Object.values(months)) delete m._fd;
  return { configured: true, months, used, errors };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!(await signedIn(req))) { res.status(401).json({ error: "Sign in to the planner first." }); return; }
    const q = new URL(req.url, "http://x").searchParams;
    const since = /^\d{4}-\d{2}-\d{2}$/.test(q.get("since") || "") ? q.get("since") : new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const sources = {}, items = [];
    for (const [name, fn] of [["youtube", youtube], ["facebook", facebook]]) {
      try { const r = await fn(since); sources[name] = { configured: r.configured, count: r.items.length, ...(r.subscribers != null ? { subscribers: r.subscribers } : {}) }; items.push(...r.items); }
      catch (e) { sources[name] = { configured: true, error: String(e.message || e).slice(0, 200) }; }
    }
    let insights = null;
    try { insights = await facebookInsights(since); } catch (e) { insights = { configured: true, errors: { all: String(e.message || e).slice(0, 200) } }; }
    res.status(200).json({ since, sources, items, insights });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
};
