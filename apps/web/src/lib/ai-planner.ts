import { getMapsApiBase } from "./maps";
import type { LocalPlanResult } from "./local-planner";
import type { TripDraft } from "./types";

function requestPayload(draft: TripDraft) {
  return {
    origin: draft.origin,
    destinations: draft.destinations,
    date_mode: draft.dateMode,
    start_date: draft.dateMode === "fixed" ? draft.startDate : null,
    days: draft.days,
    travelers: draft.travelers,
    budget_per_person: draft.budgetPerPerson,
    pace: draft.pace,
    interests: draft.interests,
    required_places: draft.requiredPlaces,
    return_to_origin: draft.returnToOrigin,
  };
}

export async function requestAiItinerary(draft: TripDraft): Promise<LocalPlanResult> {
  const base = getMapsApiBase(window.location.hostname);
  if (!base) throw new Error("AI 行程服务未配置，可使用普通生成。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${base}/api/trips/generate-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload(draft)),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "AI 行程生成失败，请重试。");
    }
    return data as LocalPlanResult;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AI 行程生成超时，请重试或使用普通生成。");
    if (error instanceof TypeError) throw new Error("AI 行程服务暂未连接，可使用普通生成。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
