const regularSports = new Set(["baseball_mlb","basketball_nba","americanfootball_nfl","icehockey_nhl"]);
const soccerLeagues = {
  soccer_epl: "プレミアリーグ",
  soccer_spain_la_liga: "ラ・リーガ",
  soccer_germany_bundesliga: "ブンデスリーガ",
  soccer_italy_serie_a: "セリエA",
  soccer_france_ligue_one: "リーグ・アン",
  soccer_uefa_champs_league: "チャンピオンズリーグ",
} as const;

async function getOdds(sport: string) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.search = new URLSearchParams({
    apiKey: process.env.ODDS_API_KEY || "",
    bookmakers: "pinnacle",
    markets: "h2h,spreads,totals",
    oddsFormat: "decimal",
    dateFormat: "iso",
  }).toString();
  const response = await fetch(url, { next: { revalidate: 55 } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "オッズを取得できません");
  return data;
}

async function addAlternateSpreads(game: any, sport: string) {
  try {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${game.id}/odds`);
    url.search = new URLSearchParams({
      apiKey: process.env.ODDS_API_KEY || "",
      bookmakers: "pinnacle",
      markets: "alternate_spreads",
      oddsFormat: "decimal",
      dateFormat: "iso",
    }).toString();
    const response = await fetch(url, { next: { revalidate: 55 } });
    if (!response.ok) return game;
    const data = await response.json();
    const alternate = data.bookmakers?.find((book: any) => book.key === "pinnacle")?.markets?.find((market: any) => market.key === "alternate_spreads");
    if (!alternate) return game;
    const bookmakers = game.bookmakers.map((book: any) => book.key === "pinnacle" ? { ...book, markets: [...book.markets, alternate] } : book);
    return { ...game, bookmakers };
  } catch {
    return game;
  }
}

export async function GET(request: Request) {
  const sport = new URL(request.url).searchParams.get("sport") || "baseball_mlb";

  if (sport === "soccer") {
    const results = await Promise.allSettled(
      Object.entries(soccerLeagues).map(async ([sportKey, leagueName]) => {
        const games = await getOdds(sportKey);
        return Promise.all(games.map(async (game: object) => ({ ...await addAlternateSpreads(game, sportKey), sport_key: sportKey, league_name: leagueName })));
      }),
    );
    const games = results
      .flatMap(result => result.status === "fulfilled" ? result.value : [])
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
    if (!games.length) return Response.json({ error: "サッカーのオッズを取得できません" }, { status: 502 });
    return Response.json({ games }, { headers: { "Cache-Control": "s-maxage=55, stale-while-revalidate=30" } });
  }

  if (!regularSports.has(sport)) return Response.json({ error: "競技が正しくありません" }, { status: 400 });
  try {
    const data = await getOdds(sport);
    const games = await Promise.all(data.map(async (game: object) => ({ ...await addAlternateSpreads(game, sport), sport_key: sport })));
    return Response.json({ games }, { headers: { "Cache-Control": "s-maxage=55, stale-while-revalidate=30" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "オッズを取得できません" }, { status: 502 });
  }
}
