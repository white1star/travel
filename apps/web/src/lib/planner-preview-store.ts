import { BUDGET_CATEGORIES } from "./itinerary-budget";
import type { Itinerary, ItineraryDay, ItineraryItem, TripDraft } from "./types";

export const PLANNER_DRAFT_KEY = "travel:planner-draft:v1";
export const PLANNER_PREVIEW_KEY = "travel:planner-preview:v1";

export type PlannerDraftRecord = {
  version: 1;
  draft: TripDraft;
  destinationText: string;
  requiredText: string;
  step: 0 | 1 | 2;
};

export type PlannerPreviewRecord = {
  version: 1;
  draft: TripDraft;
  itinerary: Itinerary;
  notices: string[];
};

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTripDraft(value: unknown, requireGenerationValid = false): value is TripDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<TripDraft>;
  const validDate = draft.dateMode === "flexible"
    || (typeof draft.startDate === "string"
      && (!requireGenerationValid ? /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) : validIsoDate(draft.startDate)));
  const numericValuesAreFinite = [draft.days, draft.travelers, draft.budgetPerPerson]
    .every(value => typeof value === "number" && Number.isFinite(value));
  const numericValuesAreGenerationValid = Number.isInteger(draft.days) && Number(draft.days) >= 1 && Number(draft.days) <= 30
    && Number.isInteger(draft.travelers) && Number(draft.travelers) >= 1 && Number(draft.travelers) <= 20
    && finiteNonNegative(draft.budgetPerPerson);
  return (draft.mode === "known" || draft.mode === "recommend")
    && typeof draft.origin === "string"
    && stringArray(draft.destinations)
    && (draft.dateMode === "fixed" || draft.dateMode === "flexible")
    && typeof draft.startDate === "string"
    && validDate
    && numericValuesAreFinite
    && (!requireGenerationValid || numericValuesAreGenerationValid)
    && (draft.pace === "compact" || draft.pace === "balanced" || draft.pace === "relaxed")
    && stringArray(draft.interests)
    && stringArray(draft.requiredPlaces)
    && typeof draft.returnToOrigin === "boolean";
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function isItem(value: unknown): value is ItineraryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ItineraryItem>;
  return typeof item.time === "string"
    && typeof item.end_time === "string"
    && typeof item.name === "string"
    && typeof item.category === "string"
    && Number.isInteger(item.duration_minutes) && Number(item.duration_minutes) >= 0
    && typeof item.description === "string"
    && finiteNonNegative(item.cost)
    && typeof item.locked === "boolean"
    && typeof item.verified_hours === "boolean"
    && isCoordinate(item.coordinate);
}

function isDay(value: unknown): value is ItineraryDay {
  if (!value || typeof value !== "object") return false;
  const day = value as Partial<ItineraryDay>;
  return Number.isInteger(day.day) && Number(day.day) >= 1
    && (day.date === null || typeof day.date === "string")
    && typeof day.city === "string"
    && typeof day.title === "string"
    && (day.intensity === "轻松" || day.intensity === "适中" || day.intensity === "紧凑")
    && Array.isArray(day.items) && day.items.every(isItem);
}

function isItinerary(value: unknown): value is Itinerary {
  if (!value || typeof value !== "object") return false;
  const itinerary = value as Partial<Itinerary>;
  const budget = itinerary.budget as Partial<Itinerary["budget"]> | undefined;
  const allocations = budget?.allocations as Record<string, unknown> | undefined;
  return typeof itinerary.id === "string" && itinerary.id.length > 0
    && typeof itinerary.title === "string" && itinerary.title.length > 0
    && Number.isInteger(itinerary.travelers) && Number(itinerary.travelers) > 0
    && stringArray(itinerary.route)
    && Array.isArray(itinerary.days) && itinerary.days.every(isDay)
    && Boolean(budget)
    && [budget?.total_available, budget?.estimated_total, budget?.transport, budget?.lodging,
      budget?.tickets, budget?.local_transport, budget?.food].every(value => typeof value === "number" && Number.isFinite(value))
    && typeof budget?.remaining === "number" && Number.isFinite(budget.remaining)
    && Boolean(allocations) && BUDGET_CATEGORIES.every(category => finiteNonNegative(allocations?.[category]))
    && typeof itinerary.generated_at === "string"
    && typeof itinerary.data_notice === "string";
}

function parseStored(storage: Storage, key: string) {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("创建数据无法读取");
  }
}

export function readPlannerDraft(storage: Storage = window.localStorage): PlannerDraftRecord | null {
  const value = parseStored(storage, PLANNER_DRAFT_KEY);
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("创建数据无法读取");
  const record = value as Partial<PlannerDraftRecord>;
  if (record.version !== 1 || !isTripDraft(record.draft)
    || typeof record.destinationText !== "string" || typeof record.requiredText !== "string"
    || (record.step !== 0 && record.step !== 1 && record.step !== 2)) {
    throw new Error("创建数据无法读取");
  }
  return record as PlannerDraftRecord;
}

export function writePlannerDraft(value: PlannerDraftRecord, storage: Storage = window.localStorage) {
  storage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(value));
}

export function clearPlannerDraft(storage: Storage = window.localStorage) {
  storage.removeItem(PLANNER_DRAFT_KEY);
}

export function readPlannerPreview(storage: Storage = window.localStorage): PlannerPreviewRecord | null {
  const value = parseStored(storage, PLANNER_PREVIEW_KEY);
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("创建数据无法读取");
  const record = value as Partial<PlannerPreviewRecord>;
  if (record.version !== 1 || !isTripDraft(record.draft, true) || !isItinerary(record.itinerary)
    || !stringArray(record.notices)) {
    throw new Error("创建数据无法读取");
  }
  return record as PlannerPreviewRecord;
}

export function writePlannerPreview(value: PlannerPreviewRecord, storage: Storage = window.localStorage) {
  storage.setItem(PLANNER_PREVIEW_KEY, JSON.stringify(value));
}

export function clearPlannerPreview(storage: Storage = window.localStorage) {
  storage.removeItem(PLANNER_PREVIEW_KEY);
}
