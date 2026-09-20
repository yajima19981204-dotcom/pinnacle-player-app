"use client";
import { FormEvent, useEffect, useState } from "react";
import { browserSupabase, playerEmail } from "@/lib/supabase";
export default function Login() {
  const [id,setId]=useState(""),[password,setPassword]=useState(""),[remember,setRemember]=useState(false),[showPassword,setShowPassword]=useState(false),[error,setError]=useState("");
  useEffect(()=>{const saved=localStorage.getItem("sportsbet-player-id");if(saved){setId(saved);setRemember(true)}},[]);
  async function submit(e:FormEvent){e.preventDefault();setError("");const {error}=await browserSupabase().auth.signInWithPassword({email:playerEmail(id),password});if(error)setError("IDまたはパスワードが違います");else{if(remember)localStorage.setItem("sportsbet-player-id",id);else localStorage.removeItem("sportsbet-player-id");location.href="/"}}
  return <main className="login"><form onSubmit={submit}><div className="logo">▲</div><h1>スポーツベットドット</h1><p>プレイヤーIDでログイン</p><label>プレイヤーID<input name="username" autoComplete="username" autoCapitalize="none" value={id} onChange={e=>setId(e.target.value)} required/></label><label>パスワード<div className="password-field"><input name="password" autoComplete="current-password" type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" className="password-eye" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?"パスワードを隠す":"パスワードを表示"}>{showPassword?"非表示":"表示"}</button></div></label><label className="remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>ログイン情報を記憶する</span></label>{error&&<div className="error">{error}</div>}<button type="submit">ログイン</button><small>IDはこの端末に保存され、パスワードは端末の安全な自動入力に対応します。</small></form></main>;
}
