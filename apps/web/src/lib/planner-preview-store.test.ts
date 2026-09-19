import { beforeEach, expect, test } from "vitest";

import { createLocalItinerary } from "./local-planner";
import {
  clearPlannerDraft,
  clearPlannerPreview,
  PLANNER_DRAFT_KEY,
  PLANNER_PREVIEW_KEY,
  readPlannerDraft,
  readPlannerPreview,
  writePlannerDraft,
  writePlannerPreview,
  type PlannerDraftRecord,
  type PlannerPreviewRecord,
} from "./planner-preview-store";
import type { TripDraft } from "./types";

const draft: TripDraft = {
  mode: "known",
  origin: "南京",
  destinations: ["苏州", "杭州"],
  dateMode: "fixed",
  startDate: "2026-10-02",
  days: 4,
  travelers: 2,
  budgetPerPerson: 3000,
  pace: "balanced",
  interests: ["园林古迹"],
  requiredPlaces: ["拙政园"],
  returnToOrigin: true,
};

const draftRecord: PlannerDraftRecord = {
  version: 1,
  draft,
  destinationText: "苏州、杭州",
  requiredText: "拙政园",
  step: 1,
};

const result = createLocalItinerary(draft, {
  id: "preview-trip",
  generatedAt: "2026-09-19T00:00:00.000Z",
});
const previewRecord: PlannerPreviewRecord = { version: 1, draft, ...result };

beforeEach(() => localStorage.clear());

test("草稿和预览可往返且使用互不覆盖的键", () => {
  writePlannerDraft(draftRecord);
  writePlannerPreview(previewRecord);

  expect(readPlannerDraft()).toEqual(draftRecord);
  expect(readPlannerPreview()).toEqual(previewRecord);
  clearPlannerPreview();
  expect(readPlannerPreview()).toBeNull();
  expect(readPlannerDraft()).toEqual(draftRecord);
  clearPlannerDraft();
  expect(readPlannerDraft()).toBeNull();
});

test("不存在的草稿和预览返回空值", () => {
  expect(readPlannerDraft()).toBeNull();
  expect(readPlannerPreview()).toBeNull();
});

test.each([
  { version: 2, draft, destinationText: "苏州", requiredText: "", step: 0 },
  { ...draftRecord, step: 3 },
  { ...draftRecord, draft: { ...draft, pace: "fast" } },
  { ...draftRecord, draft: { ...draft, travelers: "2" } },
  { ...draftRecord, draft: { ...draft, interests: ["博物馆", 1] } },
])("拒绝无效草稿 %#", value => {
  localStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(value));
  expect(() => readPlannerDraft()).toThrow("创建数据无法读取");
});

test.each([
  { version: 1, draft: {}, itinerary: {}, notices: [] },
  { ...previewRecord, itinerary: { ...previewRecord.itinerary, id: "" } },
  { ...previewRecord, itinerary: { ...previewRecord.itinerary, travelers: 0 } },
  { ...previewRecord, itinerary: { ...previewRecord.itinerary, route: ["南京", 2] } },
  { ...previewRecord, draft: { ...draft, startDate: "2026-02-30" } },
  { ...previewRecord, notices: ["可读提示", 3] },
])("损坏预览被拒绝且不影响行程库键 %#", value => {
  localStorage.setItem(PLANNER_PREVIEW_KEY, JSON.stringify(value));
  localStorage.setItem("travel:library:v2", "existing-library");

  expect(() => readPlannerPreview()).toThrow("创建数据无法读取");
  expect(localStorage.getItem("travel:library:v2")).toBe("existing-library");
});

test("写入失败向调用方抛错且不宣告持久化成功", () => {
  const failing: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    getItem: () => null,
    removeItem: () => {},
    setItem: () => { throw new Error("quota"); },
  };

  expect(() => writePlannerPreview(previewRecord, failing)).toThrow("quota");
});

test("清除失败向调用方抛错，避免界面误报已清理", () => {
  const failing: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    getItem: () => null,
    removeItem: () => { throw new Error("blocked"); },
    setItem: () => {},
  };

  expect(() => clearPlannerPreview(failing)).toThrow("blocked");
});
