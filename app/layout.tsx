import "./globals.css";
import "./agent.css";
export const metadata = { title: "スポーツポイント予想", description: "現金価値のない無料ポイント専用のスポーツ予想ゲーム" };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}</body></html>; }
