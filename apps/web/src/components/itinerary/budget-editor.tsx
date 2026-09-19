"use client";

import { type FormEvent, useState } from "react";

import { BUDGET_CATEGORIES, validatePerPersonAllocations } from "@/lib/itinerary-budget";
import type { BudgetAllocations, BudgetCategory } from "@/lib/types";

type BudgetEditorProps = {
  value: BudgetAllocations;
  onChange: (value: BudgetAllocations) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const labels: Record<BudgetCategory, string> = {
  transport: "交通",
  lodging: "住宿",
  food: "餐饮",
  tickets: "门票",
  local_transport: "本地交通",
  other: "其他",
};

export function BudgetEditor({ value, onChange, onSubmit, onCancel }: BudgetEditorProps) {
  const [raw, setRaw] = useState<Record<BudgetCategory, string>>(() => Object.fromEntries(
    BUDGET_CATEGORIES.map(category => [category, String(value[category])]),
  ) as Record<BudgetCategory, string>);
  const [errors, setErrors] = useState<Partial<Record<BudgetCategory, string>>>({});

  const change = (category: BudgetCategory, next: string) => {
    setRaw(current => ({ ...current, [category]: next }));
    if (next.trim() === "") return;
    const amount = Number(next);
    if (Number.isFinite(amount)) onChange({ ...value, [category]: amount });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Object.fromEntries(BUDGET_CATEGORIES.map(category => [
      category,
      raw[category].trim() === "" ? Number.NaN : Number(raw[category]),
    ])) as BudgetAllocations;
    const nextErrors = validatePerPersonAllocations(parsed);
    setErrors(nextErrors);
    const first = BUDGET_CATEGORIES.find(category => nextErrors[category]);
    if (first) {
      const target = event.currentTarget.elements.namedItem(first);
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    onChange(parsed);
    onSubmit();
  };

  return (
    <form className="budget-editor" aria-label="编辑分类预算" noValidate onSubmit={submit}>
      <div className="budget-editor__heading">
        <div><small>PER PERSON</small><h3>编辑人均分类预算</h3><p>可以少分或多分，确认后会明确提示差额。</p></div>
        <button className="button button--ghost" type="button" onClick={onCancel}>取消预算编辑</button>
      </div>
      {Object.keys(errors).length > 0 && <p className="form-error" role="alert">请检查分类预算：金额需大于或等于 0。</p>}
      <div className="budget-editor__grid">
        {BUDGET_CATEGORIES.map(category => {
          const error = errors[category];
          return <label className="field" htmlFor={`budget-${category}`} key={category}>
            <span>{labels[category]}预算（每人）</span>
            <span className="budget-editor__input"><span aria-hidden="true">¥</span><input id={`budget-${category}`} name={category} aria-label={`${labels[category]}预算（每人）`} type="number" min="0" step="0.01" inputMode="decimal" value={raw[category]} aria-invalid={Boolean(error)} aria-describedby={error ? `budget-error-${category}` : undefined} onChange={event => change(category, event.target.value)} /></span>
            {error && <small className="field-error" id={`budget-error-${category}`}>{error}</small>}
          </label>;
        })}
      </div>
      <div className="budget-editor__actions"><button className="button button--primary" type="submit">确认分类预算</button><button className="button button--ghost" type="button" onClick={onCancel}>取消</button></div>
    </form>
  );
}
