import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSLATION_CHUNK, episodeId, feedLanguage, formatClock, isPublicHttps, lineAt, markAds, matchEpisode, parseDuration, parseFeed, parseLink, pendingChunks, showSlug, titleSimilarity } from "../src/lib/podcasts/model";

const FEED = `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Little Talk in Slow French</title><itunes:image href="https://img.example/a.jpg"/>
<item><title><![CDATA[1/3｜Pourquoi l&apos;été ?]]></title><guid isPermaLink="false">https://api.spreaker.com/episode/73058830</guid>
<pubDate>Sun, 19 Jul 2026 20:07:32 +0000</pubDate><itunes:duration>1287</itunes:duration>
<enclosure url="https://dts.example/ep.mp3" length="20579936" type="audio/mpeg"/></item>
<item><title>Video only</title><enclosure url="https://dts.example/v.mp4" type="video/mp4"/></item>
<item><title>Plain &amp; http</title><enclosure url="http://insecure.example/a.mp3" type="audio/mpeg"/></item>
</channel></rss>`;

test("feed parsing keeps HTTPS audio episodes with decoded titles", () => {
  const feed = parseFeed(FEED);
  assert.equal(feed.title, "Little Talk in Slow French");
  assert.equal(feed.image, "https://img.example/a.jpg");
  assert.deepEqual(feed.episodes, [{
    id: "73058830", title: "1/3｜Pourquoi l'été ?", published: "2026-07-19T20:07:32.000Z",
    duration: 1287, audioUrl: "https://dts.example/ep.mp3", bytes: 20579936,
  }]);
});

test("episode ids and durations", () => {
  assert.equal(episodeId("https://api.spreaker.com/episode/42"), "42");
  assert.match(episodeId("urn:uuid:abc"), /^[0-9a-f]{14}$/);
  assert.equal(episodeId("urn:uuid:abc"), episodeId("urn:uuid:abc"));
  assert.notEqual(episodeId("urn:uuid:abc"), episodeId("urn:uuid:abd"));
  assert.equal(parseDuration("32:23"), 1943);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("x"), null);
  assert.equal(formatClock(3723), "1:02:03");
  assert.equal(formatClock(65), "1:05");
});

test("lineAt finds the line being played and holds it through gaps", () => {
  const lines = [{ start: 2, end: 4, fr: "a" }, { start: 5, end: 8, fr: "b" }, { start: 10, end: 12, fr: "c" }];
  assert.equal(lineAt(lines, 0), -1);
  assert.equal(lineAt(lines, 2), 0);
  assert.equal(lineAt(lines, 4.5), 0);
  assert.equal(lineAt(lines, 9), 1);
  assert.equal(lineAt(lines, 99), 2);
  assert.equal(lineAt([], 3), -1);
});

test("translation starts at the chunk being played and wraps", () => {
  const total = TRANSLATION_CHUNK * 3 + 5;
  assert.deepEqual(pendingChunks(total, {}, 0), [0, 40, 80, 120]);
  assert.deepEqual(pendingChunks(total, {}, 85), [80, 120, 0, 40]);
  const done: Record<number, string> = {};
  for (let i = 80; i < 120; i++) done[i] = "x";
  assert.deepEqual(pendingChunks(total, done, 85), [120, 0, 40]);
  assert.deepEqual(pendingChunks(10, Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, ""])), 0), []);
});

test("English ad breaks are flagged as runs; the host's one-line glosses are not", () => {
  let clock = 0;
  const fr = (text: string) => ({ start: clock, end: (clock += 3), fr: text });
  const lines = [
    fr("Happy birthday, America!"),
    fr("Oh, I have had no luck lately."),
    fr("Wait, lady luck?"),
    fr("They have all of my favorite games, slot games and more."),
    fr("Visit the site for more details, it's right there."),
    fr("Bonjour à toutes et à tous."),
    fr("Éviter to avoid."),
    fr("Vous faire peur to scare you."),
    fr("C'est pour éviter de répéter."),
    fr("To bear or to stand."),
    fr("Par exemple, I can't stand the heat."),
    fr("I can't stand him."),
    fr("Je ne peux pas supporter la chaleur."),
    fr("We run the business on Shopify."),
    fr("Start your free trial on Shopify.com."),
    fr("Visit the shop for all the details right now."),
  ];
  const ads = markAds(lines).map((line, i) => (line.ad ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(ads, [0, 1, 2, 3, 4, 13, 14, 15]);
  assert.equal(markAds([fr("Excuse my French, it's a joke for you.")])[0].ad, undefined);
});

test("pasted links: Spotify, Apple, feeds; share-sheet text around them", () => {
  assert.deepEqual(parseLink("Check this out https://open.spotify.com/episode/16E8oK7YNhSlyMPlxyP1D1?si=abc123"), { kind: "spotify", type: "episode", id: "16E8oK7YNhSlyMPlxyP1D1" });
  assert.deepEqual(parseLink("https://open.spotify.com/intl-fr/show/4rOoJ6Egrf8K2IrywzwOMk"), { kind: "spotify", type: "show", id: "4rOoJ6Egrf8K2IrywzwOMk" });
  assert.deepEqual(parseLink("https://spotify.link/AbCdEf"), { kind: "spotify-short", url: "https://spotify.link/AbCdEf" });
  assert.deepEqual(parseLink("https://podcasts.apple.com/fr/podcast/innerfrench/id1301811218?i=1000712345678"), { kind: "apple", showId: "1301811218", episodeId: "1000712345678" });
  assert.deepEqual(parseLink("https://podcast.innerfrench.com/feed.xml"), { kind: "feed", url: "https://podcast.innerfrench.com/feed.xml" });
  assert.equal(parseLink("not a link"), null);
  assert.equal(parseLink("https://open.spotify.com/track/abc"), null);
});

test("only public HTTPS hosts are fetched", () => {
  assert.equal(isPublicHttps("https://feeds.megaphone.fm/GLT1412515089"), true);
  for (const bad of ["http://feeds.example.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://intranet/a",
    "https://multimind.tail8a8aef.ts.net:10000/", "https://printer.local/", "https://user:pw@example.com/", "https://example.com:8095/"]) {
    assert.equal(isPublicHttps(bad), false, bad);
  }
});

test("feed language, titles and episode matching across apps", () => {
  assert.equal(feedLanguage("fr-FR"), "fr");
  assert.equal(feedLanguage(" en-us"), "en");
  assert.equal(feedLanguage("de"), null);
  assert.equal(feedLanguage(null), null);
  assert.equal(titleSimilarity("The Joe Rogan Experience", "the joe rogan experience!"), 1);
  assert.equal(titleSimilarity("L'été à Paris", "L’ete a Paris"), 1);
  assert.ok(titleSimilarity("The Joe Rogan Experience", "The Joe Rogan AI Experience") < 0.9);
  const episodes = [
    { id: "a", title: "#2572 - Colum Tyrrell", published: "2026-10-29T17:00:00.000Z", duration: 10730, audioUrl: "https://x/a.mp3", bytes: null },
    { id: "b", title: "#2571 - Someone Else", published: "2026-10-28T17:00:00.000Z", duration: 9000, audioUrl: "https://x/b.mp3", bytes: null },
    { id: "c", title: "Episode 12: Bonjour", published: "2026-01-02T08:00:00.000Z", duration: 1200, audioUrl: "https://x/c.mp3", bytes: null },
  ];
  assert.equal(matchEpisode(episodes, { title: "#2572 - Colum Tyrrell", published: "2026-10-29T17:00:00Z" })?.id, "a");
  // Spotify sometimes words a title a little differently; the same release day settles it.
  assert.equal(matchEpisode(episodes, { title: "Bonjour (Ep. 12)", published: "2026-01-02T00:00:00Z" })?.id, "c");
  assert.equal(matchEpisode(episodes, { title: "Something unrelated", published: "2025-05-05T00:00:00Z" }), null);
  assert.equal(matchEpisode(episodes, { title: "Bonjour", published: null }), null);
});

test("show ids from titles stay unique", () => {
  assert.equal(showSlug("The Joe Rogan Experience", new Set()), "the-joe-rogan-experience");
  assert.equal(showSlug("Café crème", new Set(["cafe-creme"])), "cafe-creme-2");
  assert.equal(showSlug("!!!", new Set()), "show");
});
