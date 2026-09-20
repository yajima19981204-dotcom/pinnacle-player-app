const sports = new Set(["baseball_mlb","basketball_nba","americanfootball_nfl","icehockey_nhl","soccer_epl","soccer_uefa_champs_league","soccer_japan_j_league"]);
export async function GET(request: Request) {
  const sport = new URL(request.url).searchParams.get("sport") || "baseball_mlb";
  if (!sports.has(sport)) return Response.json({ error: "競技が正しくありません" }, { status: 400 });
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.search = new URLSearchParams({ apiKey: process.env.ODDS_API_KEY || "", bookmakers: "pinnacle", markets: "h2h,spreads,totals", oddsFormat: "decimal", dateFormat: "iso" }).toString();
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  return Response.json(response.ok ? { games: data } : { error: data.message || "オッズを取得できません" }, { status: response.status });
}
