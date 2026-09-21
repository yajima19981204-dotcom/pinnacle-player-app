import { createClient } from "@supabase/supabase-js";
import { adminSupabase, requireUser } from "@/lib/supabase";

type ScoreEvent={id:string;completed:boolean; scores?:{name:string;score:string}[]};
type Bet={id:string;event_id:string;sport_key:string;market_key:string;selection_name:string;point:number|null;status:string};

export async function GET(request:Request){
 const user=await requireUser(request);if(!user)return Response.json({error:"ログインが必要です"},{status:401});
 const db=adminSupabase();const {data:pending}=await db.from("bets").select("id,event_id,sport_key,market_key,selection_name,point,status").eq("user_id",user.id).eq("status","pending");
 for(const sport of [...new Set((pending||[]).map((b:Bet)=>b.sport_key))]){
  try{const url=new URL(`https://api.the-odds-api.com/v4/sports/${sport}/scores/`);url.search=new URLSearchParams({apiKey:process.env.ODDS_API_KEY||"",daysFrom:"3",dateFormat:"iso"}).toString();const scores:ScoreEvent[]=await (await fetch(url,{cache:"no-store"})).json();
   for(const bet of (pending||[]).filter((b:Bet)=>b.sport_key===sport)){const event=scores.find(e=>e.id===bet.event_id&&e.completed&&e.scores?.length);if(!event)continue;const result=grade(bet,event);if(result)await db.rpc("settle_point_bet",{p_bet:bet.id,p_result:result});}
  }catch{}
 }
 const {data,error}=await db.from("bets").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);if(error)return Response.json({error:error.message},{status:500});return Response.json({bets:data||[]});
}

function grade(bet:Bet,event:ScoreEvent){const scores=event.scores||[];const selected=scores.find(s=>s.name===bet.selection_name);if(bet.market_key==="h2h"){const values=scores.map(s=>Number(s.score));if(bet.selection_name==="Draw")return values.length>1&&values.every(v=>v===values[0])?"win":"loss";if(!selected)return null;const mine=Number(selected.score),best=Math.max(...values);return values.every(v=>v===mine)?"push":mine===best?"win":"loss"}if(["spreads","alternate_spreads"].includes(bet.market_key)){if(!selected)return null;const other=scores.find(s=>s.name!==bet.selection_name);if(!other)return null;const margin=Number(selected.score)-Number(other.score),line=Number(bet.point||0),lower=Math.floor(line*2)/2,upper=Math.ceil(line*2)/2;const part=(handicap:number)=>margin+handicap===0?"push":margin+handicap>0?"win":"loss";const results=[part(lower),part(upper)];if(results.every(r=>r==="win"))return"win";if(results.every(r=>r==="loss"))return"loss";if(results.every(r=>r==="push"))return"push";if(results.includes("win")&&results.includes("push"))return"half_win";if(results.includes("loss")&&results.includes("push"))return"half_loss";return null}if(bet.market_key==="totals"){const total=scores.reduce((n,s)=>n+Number(s.score),0),line=Number(bet.point||0);if(total===line)return"push";return bet.selection_name==="Over"?(total>line?"win":"loss"):(total<line?"win":"loss")}return null}

export async function POST(request:Request){
 const user=await requireUser(request);if(!user)return Response.json({error:"ログインが必要です"},{status:401});const b=await request.json();const stake=Number(b.stake);if(!Number.isInteger(stake)||stake<1)return Response.json({error:"ポイント数が正しくありません"},{status:400});
 const isAlternate=b.marketKey==="alternate_spreads";const url=new URL(isAlternate?`https://api.the-odds-api.com/v4/sports/${b.sportKey}/events/${b.eventId}/odds`:`https://api.the-odds-api.com/v4/sports/${b.sportKey}/odds/`);url.search=new URLSearchParams({apiKey:process.env.ODDS_API_KEY||"",bookmakers:"pinnacle",markets:isAlternate?"alternate_spreads":"h2h,spreads,totals",oddsFormat:"decimal",dateFormat:"iso"}).toString();
 const responseData=await (await fetch(url,{cache:"no-store"})).json();const game=isAlternate?responseData:(Array.isArray(responseData)?responseData.find((g:any)=>g.id===b.eventId):null);const book=game?.bookmakers?.find((x:any)=>x.key==="pinnacle")||game?.bookmakers?.[0];const market=book?.markets?.find((m:any)=>m.key===b.marketKey);const outcome=market?.outcomes?.find((o:any)=>o.name===b.selectionName&&(o.point??null)===(b.point??null));if(!game||!outcome)return Response.json({error:"オッズが更新されました。もう一度選んでください"},{status:409});
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});const {data,error}=await client.rpc("place_point_bet",{p_event_id:game.id,p_sport_key:b.sportKey,p_commence_time:game.commence_time,p_home_team:game.home_team,p_away_team:game.away_team,p_market_key:b.marketKey,p_selection_name:outcome.name,p_point:outcome.point??null,p_odds:outcome.price,p_stake:stake});if(error)return Response.json({error:error.message},{status:400});return Response.json({ok:true,betId:data});
}

export async function DELETE(request:Request){
 const user=await requireUser(request);if(!user)return Response.json({error:"ログインが必要です"},{status:401});
 const {betId}=await request.json();if(typeof betId!=="string")return Response.json({error:"対象のベットが正しくありません"},{status:400});
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {error}=await client.rpc("cancel_point_bet",{p_bet:betId});if(error)return Response.json({error:error.message},{status:400});
 return Response.json({ok:true});
}
