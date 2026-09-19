"use client";

import { AlertTriangle, ChevronDown, Pencil, WalletCards } from "lucide-react";
import { useState } from "react";

import { getBudgetOverview, type BudgetCategorySummary, type BudgetSource } from "@/lib/itinerary-budget";
import type { BudgetAllocations, BudgetCategory, Itinerary } from "@/lib/types";
import { BudgetEditor } from "./budget-editor";

type TravelBudgetProps = {
  itinerary: Itinerary;
  draft: BudgetAllocations | null;
  onStartEdit: () => void;
  onDraftChange: (value: BudgetAllocations) => void;
  onCommit: () => void;
  onCancel: () => void;
};

const moneyFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const money = (value: number) => `¥${moneyFormatter.format(Math.abs(value))}`;

function sourceAmount(source: BudgetSource): string {
  if (source.kind === "estimate") return `${money(source.perPersonAmount)}/人`;
  return source.costScope === "per_person"
    ? `${money(source.perPersonAmount)}/人`
    : `整单 ${money(source.groupAmount)}，折合 ${money(source.perPersonAmount)}/人`;
}

function CategoryCard({ category, expanded, onToggle }: { category: BudgetCategorySummary; expanded: boolean; onToggle: () => void }) {
  const percentage = category.allocationGroup > 0
    ? category.plannedGroup / category.allocationGroup * 100
    : category.plannedGroup > 0 ? Number.POSITIVE_INFINITY : 0;
  const progressText = category.isOver
    ? `已使用 ${money(category.plannedPerPerson)}/人，超出 ${money(-category.differencePerPerson)}/人`
    : `已使用 ${money(category.plannedPerPerson)}/人，剩余 ${money(category.differencePerPerson)}/人`;
  return <article className={`budget-category${category.isOver ? " is-over" : ""}`}>
    <div className="budget-category__heading"><div><span>{category.label}</span>{category.incomplete && <small>金额待补充</small>}</div><strong>额度 {money(category.allocationPerPerson)}/人</strong></div>
    <div className="budget-category__figures"><span>计划 {money(category.plannedPerPerson)}/人</span><span>{category.isOver ? `超出 ${money(-category.differencePerPerson)}/人` : `剩余 ${money(category.differencePerPerson)}/人`}</span></div>
    <div className="budget-progress" role="progressbar" aria-label={`${category.label}预算使用情况`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Number.isFinite(percentage) ? Math.round(percentage) : 100, 100)} aria-valuetext={progressText}><span style={{ width: `${Math.min(Number.isFinite(percentage) ? percentage : 100, 100)}%` }} /></div>
    <button className="budget-source-toggle" type="button" aria-expanded={expanded} onClick={onToggle}>查看{category.label}费用来源<ChevronDown size={15} /></button>
    {expanded && <ul className="budget-source-list">{category.sources.map(source => <li key={source.id}><span>{source.label}</span><strong>{sourceAmount(source)}</strong></li>)}</ul>}
  </article>;
}

export function TravelBudget({ itinerary, draft, onStartEdit, onDraftChange, onCommit, onCancel }: TravelBudgetProps) {
  const overview = getBudgetOverview(itinerary);
  const [expanded, setExpanded] = useState<BudgetCategory | null>(null);
  const cancelled = (itinerary.reservations ?? []).some(value => value.status === "cancelled");
  const warnings: string[] = [];
  if (overview.allocationDifferencePerPerson > 0) warnings.push(`还有 ${money(overview.allocationDifferencePerPerson)}/人尚未分配`);
  if (overview.allocationDifferencePerPerson < 0) warnings.push(`分类预算超出总预算 ${money(overview.allocationDifferencePerPerson)}/人`);
  for (const category of overview.categories) {
    if (category.isOver) warnings.push(`${category.label}预计超出 ${money(-category.differencePerPerson)}/人`);
    if (category.incomplete) warnings.push(`${category.label}金额可能不完整，请补充未填写的费用或检查覆盖范围`);
  }
  if (cancelled) warnings.push("已取消的交通住宿记录不计入预算统计");

  return (
    <section className="travel-budget" aria-label="预算中心">
      <div className="budget-heading">
        <div><span>TRIP BUDGET</span><h2>预算与费用</h2><p>先按人均规划，再查看整团支出；预订价格会替代对应估算。</p></div>
        {draft === null && <button className="button button--primary" onClick={onStartEdit}><Pencil size={16} />编辑分类预算</button>}
      </div>

      <section className="budget-summary" aria-label="预算总览">
        <article><span>每人总预算</span><strong>{money(overview.totalAvailablePerPerson)}</strong><small>{overview.travelers} 人同行</small></article>
        <article><span>每人计划支出</span><strong>{money(overview.plannedPerPerson)}</strong><small>整团计划支出 {money(overview.plannedGroup)}</small></article>
        <article className={overview.remainingPerPerson < 0 ? "is-over" : ""}><span>{overview.remainingPerPerson < 0 ? "每人预计超支" : "每人预计剩余"}</span><strong>{money(overview.remainingPerPerson)}</strong><small>整团总预算 {money(overview.totalAvailableGroup)}</small></article>
      </section>

      {draft && <BudgetEditor value={draft} onChange={onDraftChange} onSubmit={onCommit} onCancel={onCancel} />}

      {warnings.length > 0 && <aside className="budget-warnings" aria-label="预算提醒" role="status"><div><AlertTriangle size={18} /><strong>预算提醒</strong></div><ul>{warnings.map(message => <li key={message}>{message}</li>)}</ul></aside>}

      {overview.plannedGroup === 0 && <div className="budget-empty"><WalletCards size={20} /><p>尚无可计算的计划费用</p><small>补充预订费用后，这里会自动更新。</small></div>}

      <div className="budget-category-grid" aria-label="分类预算">
        {overview.categories.map(category => <CategoryCard key={category.key} category={category} expanded={expanded === category.key} onToggle={() => setExpanded(current => current === category.key ? null : category.key)} />)}
      </div>
    </section>
  );
}
