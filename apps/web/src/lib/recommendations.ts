import { getMapsApiBase } from "./maps";
import type { ItineraryItem } from "./types";

export interface DayRecommendationRequest {
  city: string;
  date: string | null;
  intensity: "轻松" | "适中" | "紧凑";
  travelers: number;
  remaining_budget_total: number;
  existing_items: Array<{ name: string; time: string; end_time: string; poi_id?: string }>;
  request: string;
}

export interface DayRecommendation {
  poi_id: string;
  name: string;
  address: string;
  citycode: string;
  coordinate: [number, number];
  category: string;
  time: string;
  end_time: string;
  duration_minutes: number;
  cost: number;
  reason: string;
  notice: string;
}

export interface DayRecommendationResponse {
  recommendations: DayRecommendation[];
  summary: string;
  warnings: string[];
}

export async function requestDayRecommendations(
  payload: DayRecommendationRequest,
  signal?: AbortSignal,
): Promise<DayRecommendationResponse> {
  const base = getMapsApiBase(window.location.hostname);
  if (!base) throw new Error("AI 推荐服务未配置，仍可手动添加安排。");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 60_000);
  try {
    const response = await fetch(`${base}/api/recommendations/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "AI 推荐失败，请重试。");
    }
    return data as DayRecommendationResponse;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AI 推荐已取消或超时，请重试。");
    if (error instanceof TypeError) throw new Error("AI 推荐服务暂未连接，仍可手动添加安排。");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function recommendationToItem(value: DayRecommendation): ItineraryItem {
  return {
    name: value.name,
    category: value.category,
    time: value.time,
    end_time: value.end_time,
    duration_minutes: value.duration_minutes,
    description: value.reason,
    cost: value.cost,
    locked: false,
    verified_hours: false,
    notice: "AI 推荐 · 开放时间与费用需确认",
    coordinate: value.coordinate,
    poi_id: value.poi_id,
    address: value.address,
    citycode: value.citycode,
    location_source: "amap",
  };
}
