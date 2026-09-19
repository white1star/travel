"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  recommendationToItem,
  requestDayRecommendations,
  type DayRecommendation,
  type DayRecommendationResponse,
} from "@/lib/recommendations";
import type { Itinerary, ItineraryItem } from "@/lib/types";

type AiDayRecommendationsProps = {
  itinerary: Itinerary;
  dayIndex: number;
  onApply: (items: ItineraryItem[]) => void;
  onClose: () => void;
};

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function overlapsExisting(recommendation: DayRecommendation, items: ItineraryItem[]) {
  return items.some((item) => recommendation.time < item.end_time && item.time < recommendation.end_time);
}

function replanRecommendations(recommendations: DayRecommendation[], existingItems: ItineraryItem[]) {
  let cursor = existingItems.reduce((latest, item) => Math.max(latest, minutes(item.end_time)), 8 * 60) + 30;
  return recommendations.map((recommendation) => {
    const start = Math.max(minutes(recommendation.time), cursor);
    const end = start + recommendation.duration_minutes;
    if (end >= 24 * 60) return recommendation;
    cursor = end + 30;
    return { ...recommendation, time: clock(start), end_time: clock(end) };
  });
}

export function AiDayRecommendations({ itinerary, dayIndex, onApply, onClose }: AiDayRecommendationsProps) {
  const day = itinerary.days[dayIndex];
  const [requestText, setRequestText] = useState("");
  const [result, setResult] = useState<DayRecommendationResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);

  useEffect(() => {
    controllerRef.current?.abort();
    revisionRef.current += 1;
    setResult(null);
    setSelectedIds(new Set());
    setError("");
    setLoading(false);
    setRescheduled(false);
    return () => controllerRef.current?.abort();
  }, [dayIndex, itinerary.id]);

  const conflicts = useMemo(() => {
    if (!result || !day) return new Set<string>();
    return new Set(
      result.recommendations
        .filter((recommendation) => overlapsExisting(recommendation, day.items))
        .map((recommendation) => recommendation.poi_id),
    );
  }, [day, result]);

  if (!day) return null;

  async function generate() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setLoading(true);
    setError("");
    setRescheduled(false);
    try {
      const next = await requestDayRecommendations({
        city: day.city,
        date: day.date,
        intensity: day.intensity,
        travelers: itinerary.travelers,
        remaining_budget_total: Math.max(0, itinerary.budget.remaining),
        existing_items: day.items.slice(0, 20).map((item) => ({
          name: item.name,
          time: item.time,
          end_time: item.end_time,
          ...(item.poi_id ? { poi_id: item.poi_id } : {}),
        })),
        request: requestText.trim(),
      }, controller.signal);
      if (revisionRef.current !== revision || controller.signal.aborted) return;
      setResult(next);
      setSelectedIds(new Set(next.recommendations.map((item) => item.poi_id)));
    } catch (reason) {
      if (revisionRef.current !== revision || controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "AI 推荐失败，请重试。");
    } finally {
      if (revisionRef.current === revision) setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function replan() {
    if (!result) return;
    setResult({ ...result, recommendations: replanRecommendations(result.recommendations, day.items) });
    setRescheduled(true);
  }

  function apply() {
    if (!result) return;
    const items = result.recommendations
      .filter((item) => selectedIds.has(item.poi_id))
      .map(recommendationToItem);
    if (!items.length) return;
    onApply(items);
    onClose();
  }

  const generateLabel = loading ? "生成中…" : error ? "重试推荐" : result ? "重新推荐" : "生成推荐";

  return (
    <section className="ai-recommend-panel" aria-label="AI 推荐当天安排">
      <div className="ai-recommend-header">
        <div>
          <span className="eyebrow">AI 行程助手</span>
          <h3>为 D{day.day} 推荐地点和时间</h3>
          <p>先预览、再勾选加入；推荐地点均来自地图候选。</p>
        </div>
        <button type="button" className="ghost-button" onClick={onClose} aria-label="关闭 AI 推荐">关闭</button>
      </div>

      <div className="ai-request-field">
        <label htmlFor="ai-day-request">补充你的要求</label>
        <textarea
          id="ai-day-request"
          value={requestText}
          maxLength={300}
          rows={3}
          placeholder="例如：带老人，少走路；下午下雨，优先室内"
          onChange={(event) => setRequestText(event.target.value)}
        />
        <small>{requestText.length}/300</small>
      </div>

      <div className="ai-recommend-actions">
        <button type="button" className="primary-button" disabled={loading} onClick={generate}>{generateLabel}</button>
        <span>将结合当天城市、节奏、预算和已有安排。</span>
      </div>

      {error ? <p className="ai-recommend-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="ai-recommend-results">
          <div className="ai-recommend-summary">
            <strong>{result.summary}</strong>
            {result.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>

          {rescheduled ? <p className="ai-replan-notice">推荐时间已顺延，确认后再写入行程。</p> : null}

          <div className="ai-recommend-grid">
            {result.recommendations.map((recommendation) => {
              const selected = selectedIds.has(recommendation.poi_id);
              const conflict = conflicts.has(recommendation.poi_id);
              return (
                <article className={`ai-recommend-card${selected ? " is-selected" : ""}`} key={recommendation.poi_id}>
                  <label className="ai-recommend-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      aria-label={`${selected ? "不选择" : "选择"}${recommendation.name}`}
                      onChange={() => toggle(recommendation.poi_id)}
                    />
                    <span>{recommendation.time}–{recommendation.end_time}</span>
                  </label>
                  <h4>{recommendation.name}</h4>
                  <p>{recommendation.reason}</p>
                  <div className="ai-recommend-meta">
                    <span>{recommendation.category}</span>
                    <span>预计 ¥{recommendation.cost}</span>
                  </div>
                  {conflict ? <strong className="ai-conflict">加入后建议重新排程</strong> : null}
                </article>
              );
            })}
          </div>

          <div className="ai-result-actions">
            {conflicts.size ? <button type="button" className="secondary-button" onClick={replan}>按建议重新排程</button> : null}
            <button type="button" className="primary-button" aria-label="加入当天" disabled={!selectedIds.size} onClick={apply}>
              加入当天{selectedIds.size ? `（${selectedIds.size}项）` : ""}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
