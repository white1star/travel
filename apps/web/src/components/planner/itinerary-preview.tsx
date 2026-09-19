"use client";

import { ArrowLeft, Clock3, LockKeyhole, MapPinOff, MapPinned, Save, WalletCards } from "lucide-react";

import { BUDGET_CATEGORIES } from "@/lib/itinerary-budget";
import type { PlannerPreviewRecord } from "@/lib/planner-preview-store";

type ItineraryPreviewProps = {
  value: PlannerPreviewRecord;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
};

const CATEGORY_LABELS = {
  transport: "交通",
  lodging: "住宿",
  food: "餐饮",
  tickets: "门票",
  local_transport: "市内交通",
  other: "其他",
} as const;

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function dateSummary(value: PlannerPreviewRecord) {
  const dated = value.itinerary.days.map(day => day.date).filter((date): date is string => Boolean(date));
  if (!dated.length) return `日期待定 · ${value.itinerary.days.length} 天`;
  return `${dated[0]} 至 ${dated.at(-1)} · ${value.itinerary.days.length} 天`;
}

function isPendingLocation(coordinate: [number, number]) {
  return coordinate[0] === 0 && coordinate[1] === 0;
}

export function ItineraryPreview({ value, saving, onBack, onSave }: ItineraryPreviewProps) {
  const { itinerary, notices } = value;
  const allocations = itinerary.budget.allocations;
  const perPerson = itinerary.travelers > 0
    ? itinerary.budget.total_available / itinerary.travelers
    : itinerary.budget.total_available;

  return (
    <section className="planner-preview" aria-label="行程预览" aria-busy={saving}>
      <header className="planner-preview__header">
        <span className="planner-preview__eyebrow"><MapPinned size={17} />生成预览</span>
        <h1>先看看这份行程</h1>
        <p>这份计划还没有保存。确认路线、节奏和预算后，再加入“我的行程”。</p>
      </header>

      <div className="planner-preview__layout">
        <div className="planner-preview__days" aria-label="每日安排">
          {itinerary.days.map(day => (
            <article className="planner-preview-day" key={`${day.day}-${day.city}`}>
              <header>
                <div><span>D{day.day}</span><h2>{day.title}</h2></div>
                <p>{day.date ?? "日期待定"} · {day.intensity}</p>
              </header>
              {day.items.length ? (
                <ol className="planner-preview-items">
                  {day.items.map((item, index) => (
                    <li key={`${item.name}-${item.time}-${index}`}>
                      <time>{item.time}</time>
                      <div>
                        <div className="planner-preview-item__title">
                          <h3>{item.name}</h3>
                          {item.locked && <span className="planner-preview-badge"><LockKeyhole size={12} />必去</span>}
                          {isPendingLocation(item.coordinate) && <span className="planner-preview-badge planner-preview-badge--pending"><MapPinOff size={12} />待定位</span>}
                        </div>
                        <p>{item.category} · 约 {Math.round(item.duration_minutes / 30) / 2} 小时</p>
                        <small><Clock3 size={12} />开放时间待确认{item.cost > 0 ? ` · 预估 ${money(item.cost)}/人` : " · 免费或费用待确认"}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="planner-preview-empty">
                  <MapPinOff size={20} />
                  <strong>当天地点待完善</strong>
                  <p>保存后可以通过地点搜索补充真实位置。</p>
                </div>
              )}
            </article>
          ))}
        </div>

        <aside className="planner-preview__summary" aria-label="行程摘要">
          <section>
            <h2>行程摘要</h2>
            <dl>
              <div><dt>路线</dt><dd>{itinerary.route.join(" → ")}</dd></div>
              <div><dt>日期</dt><dd>{dateSummary(value)}</dd></div>
              <div><dt>同行</dt><dd>{itinerary.travelers} 人</dd></div>
              <div><dt>预算</dt><dd>人均 {money(perPerson)}<small>整团 {money(itinerary.budget.total_available)}</small></dd></div>
            </dl>
          </section>

          {notices.length > 0 && (
            <section className="planner-preview__notices" role="status" aria-label="规划提示">
              <h2>生成提示</h2>
              <ul>{notices.map(notice => <li key={notice}>{notice}</li>)}</ul>
            </section>
          )}

          <section className="planner-preview__budget">
            <h2><WalletCards size={17} />分类预算</h2>
            <p>以下为整团出发前额度，可保存后继续调整。</p>
            <dl>
              {BUDGET_CATEGORIES.map(category => (
                <div key={category}>
                  <dt>{CATEGORY_LABELS[category]}</dt>
                  <dd>{money(allocations?.[category] ?? 0)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <div className="planner-preview__actions">
        <button type="button" className="button button--ghost" disabled={saving} onClick={onBack}>
          <ArrowLeft size={17} />返回修改
        </button>
        <button type="button" className="button button--primary" disabled={saving} onClick={onSave}>
          <Save size={17} />{saving ? "正在保存…" : "确认保存行程"}
        </button>
      </div>
    </section>
  );
}
