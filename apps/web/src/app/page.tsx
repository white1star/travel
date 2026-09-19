import Link from "next/link";
import { ArrowRight, Check, Compass, FolderOpen, MapPinned, Route, SlidersHorizontal, BookmarkCheck } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { CardReveal } from "@/components/card-reveal";

const workflow = [
  { title: "填写需求", detail: "目的地、时间、预算，再选一个舒服的节奏。", icon: MapPinned },
  { title: "生成路线", detail: "把景点、美食与交通组织成逐日安排。", icon: Route },
  { title: "调整安排", detail: "换一个地点，或给喜欢的地方多留些时间。", icon: SlidersHorizontal },
  { title: "保存出发", detail: "行程保存在当前浏览器，随时回来查看。", icon: BookmarkCheck },
];

function RoutePreview() {
  return (
    <section className="landing-preview" aria-label="规划结果预览">
      <div className="landing-preview__heading"><span><i />你的旅行，会这样展开</span><small>路线示意</small></div>
      <div className="landing-preview__labels"><span>逐日安排</span><span>路线优化</span><span>预算分配</span></div>
      <div className="landing-route">
        <div className="landing-route__caption"><span><Route size={14} />把喜欢的地方，连成一段旅程</span><small>按你的节奏</small></div>
        <svg viewBox="0 0 540 220" role="img" aria-label="从抵达到城市漫步、当地体验和休息的路线示意，非真实导航地图">
          <defs><pattern id="home-route-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#DBEAE4" strokeWidth=".8" strokeDasharray="2 3" /></pattern></defs>
          <rect width="540" height="220" fill="url(#home-route-grid)" />
          <path d="M60 140C115 140 130 65 195 65S290 165 365 110S430 65 480 65" stroke="#59CBB2" strokeOpacity=".25" strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M60 140C115 140 130 65 195 65S290 165 365 110S430 65 480 65" stroke="#173D35" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <g transform="translate(60 140)"><rect x="-8" y="-8" width="16" height="16" rx="4" fill="#173D35" /><rect x="-3" y="-3" width="6" height="6" rx="1" fill="#59CBB2" /><text x="0" y="-19">01</text><text x="0" y="30" className="landing-route__stop">轻松抵达</text></g>
          <g transform="translate(195 65)"><circle r="7" fill="#59CBB2" /><circle r="12" stroke="#59CBB2" strokeDasharray="2 2" fill="none" /><text x="0" y="-29">02</text><text x="0" y="-14" className="landing-route__stop">城市漫步</text></g>
          <g transform="translate(365 110)"><circle r="7" fill="#173D35" /><circle r="12" stroke="#59CBB2" strokeWidth="2" fill="none" /><text x="0" y="-22">03</text><text x="0" y="30" className="landing-route__stop">当地体验</text></g>
          <g transform="translate(480 65)"><path d="M0-9L8 6H-8Z" fill="#173D35" /><text x="0" y="-25">04</text><text x="0" y="29" className="landing-route__stop">留点空闲</text></g>
        </svg>
        <div className="landing-route__note"><span><Check size={14} />景点 · 美食 · 交通 · 休息</span><small>具体安排在生成后查看</small></div>
      </div>
      <div className="landing-preview__footer"><span>不必把每一分钟排满</span><small>好玩的地方，也值得慢慢走</small></div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader active="home" />
      <main id="main-content" className="landing-page">
        <div className="landing-topline"><span><i />准备下一次出发</span><span>TRAVEL PLANNER</span></div>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-kicker"><Compass size={15} />一份属于你的旅行计划</span>
            <h1>把行程安排明白，<br />再出发。</h1>
            <p>选择目的地、时间和旅行偏好，得到按天安排的路线。少一点做攻略的忙乱，多一点出发的期待。</p>
            <div className="landing-cta"><Link className="button button--primary button--large" href="/plan/new">开始规划<ArrowRight size={18} /></Link><span><Check size={16} />无需注册 · 先生成再调整</span></div>
            <form className="landing-quick" action="/plan/new" method="get" aria-label="快速规划">
              <label><span>目的地</span><input name="destination" placeholder="想去哪里？" maxLength={100} /></label>
              <label><span>行程天数</span><input name="days" type="number" min={1} max={30} defaultValue={4} required /></label>
              <label><span>旅行节奏</span><select name="pace" defaultValue="balanced"><option value="compact">紧凑打卡</option><option value="balanced">适中探索</option><option value="relaxed">轻松度假</option></select></label>
              <button type="submit" className="landing-quick__submit">继续规划<ArrowRight size={15} /></button>
            </form>
          </div>
          <RoutePreview />
        </section>
        <nav className="landing-entries" aria-label="旅行入口">
          <CardReveal><Link className="entry-card" href="/plan/new"><span className="entry-card__line" /><div className="entry-card__top"><span className="entry-card__icon"><Compass size={25} /></span><span className="entry-card__index">01 / 规划</span></div><h2>规划一次旅行</h2><p>告诉我们想去哪、待多久、怎么玩。把零散的想法，整理成每天都能查看的旅行安排。</p><span className="entry-card__action">立即开始规划<ArrowRight size={17} /></span></Link></CardReveal>
          <CardReveal><Link className="entry-card" href="/trips"><span className="entry-card__line" /><div className="entry-card__top"><span className="entry-card__icon"><FolderOpen size={25} /></span><span className="entry-card__index">02 / 行程</span></div><h2>查看我的行程</h2><p>打开已经保存的旅行计划，继续调整地点和停留时间。下次出发前，不用从头翻找攻略。</p><span className="entry-card__action">进入我的行程<ArrowRight size={17} /></span></Link></CardReveal>
        </nav>
        <section className="landing-workflow" aria-labelledby="workflow-title">
          <div className="landing-section-heading"><h2 id="workflow-title"><i />从一个想法，到一次出发</h2><span>简单四步</span></div>
          <ol>{workflow.map(({ title, detail, icon: Icon }, index) => <li key={title}><div><span>0{index + 1}</span><Icon size={20} /></div><h3>{title}</h3><p>{detail}</p></li>)}</ol>
        </section>
      </main>
      <footer className="landing-footer"><span>旅行计划</span><small>把时间留给旅行</small><Link href="/trips">我的行程<ArrowRight size={14} /></Link></footer>
    </>
  );
}
