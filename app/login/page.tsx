"use client";
import { FormEvent, useState } from "react";
import { browserSupabase, playerEmail } from "@/lib/supabase";
export default function Login() {
  const [id,setId]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState("");
  async function submit(e:FormEvent){e.preventDefault();setError("");const {error}=await browserSupabase().auth.signInWithPassword({email:playerEmail(id),password});if(error)setError("IDまたはパスワードが違います");else location.href="/";}
  return <main className="login"><form onSubmit={submit}><div className="logo">▲</div><h1>スポーツポイント予想</h1><p>プレイヤーIDでログイン</p><label>プレイヤーID<input autoCapitalize="none" value={id} onChange={e=>setId(e.target.value)} required/></label><label>パスワード<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button>ログイン</button><small>ポイントに現金価値はありません。</small></form></main>;
}
