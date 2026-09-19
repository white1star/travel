import Link from "next/link";
import { MapPinned } from "lucide-react";

export function SiteHeader({ active }: { active?: "home" | "plan" | "trips" }) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <div className="site-header__inner">
        <Link className="brand" href="/">
          <span className="brand__mark"><MapPinned size={18} strokeWidth={2.2} /></span>
          <span>旅行计划</span>
        </Link>
        <nav aria-label="主导航" className="main-nav">
          <Link href="/" aria-current={active === "home" ? "page" : undefined}>首页</Link>
          <Link href="/plan/new" aria-current={active === "plan" ? "page" : undefined}>创建行程</Link>
          <Link href="/trips" aria-current={active === "trips" ? "page" : undefined}>我的行程</Link>
        </nav>
        <div className="header-actions">
          <Link className="text-button" href="/plan/new">新建行程</Link>
        </div>
      </div>
    </header>
  );
}
