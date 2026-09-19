import { beforeEach, expect, test } from "vitest";

import { DEMO_ITINERARY } from "./demo-itinerary";
import {
  findReservationIssues,
  getTripReadiness,
  isTravelReservation,
  removeReservation,
  sortReservations,
  upsertReservation,
  validateReservation,
} from "./itinerary-reservations";
import type { StayReservation, TransportReservation } from "./types";

export const train: TransportReservation = {
  id: "train-1", kind: "transport", mode: "train", status: "confirmed",
  title: "南京到苏州", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35",
  departure_place: "南京南站", arrival_place: "苏州站", cost: 180,
};
export const stay: StayReservation = {
  id: "stay-1", kind: "stay", stay_type: "hotel", status: "planned",
  title: "苏州酒店", check_in_date: "2026-10-02", check_out_date: "2026-10-04",
};

beforeEach(() => localStorage.clear());

test("校验倒序时间、空地点、无效日历日期和长度", () => {
  expect(validateReservation({ ...train, arrival_at: "2026-10-02T07:00", arrival_place: "" })).toMatchObject({
    arrival_at: expect.any(String), arrival_place: expect.any(String),
  });
  expect(validateReservation({ ...stay, check_out_date: "2026-10-02" })).toHaveProperty("check_out_date");
  expect(validateReservation({ ...stay, check_in_date: "2026-02-30" })).toHaveProperty("check_in_date");
  expect(validateReservation({ ...train, notes: "长".repeat(501) })).toHaveProperty("notes");
  expect(validateReservation(train)).toEqual({});
});

test("费用留空与明确零元均有效，负数无效", () => {
  expect(validateReservation({ ...stay, cost: undefined })).not.toHaveProperty("cost");
  expect(validateReservation({ ...stay, cost: 0 })).not.toHaveProperty("cost");
  expect(validateReservation({ ...stay, cost: -1 })).toHaveProperty("cost");
});

test("新增、更新和删除预订不修改原行程", () => {
  const original = { ...DEMO_ITINERARY, reservations: [] };
  const added = upsertReservation(original, train);
  const updated = upsertReservation(added, { ...train, title: "更新车次" });
  expect(original.reservations).toEqual([]);
  expect(updated.reservations).toHaveLength(1);
  expect(updated.reservations?.[0].title).toBe("更新车次");
  expect(removeReservation(updated, "train-1").reservations).toEqual([]);
});

test("按实际发生时间稳定排序且不修改输入", () => {
  const values = [{ ...stay, id: "late", check_in_date: "2026-10-04" }, train, stay];
  expect(sortReservations(values).map(value => value.id)).toEqual(["train-1", "stay-1", "late"]);
  expect(values.map(value => value.id)).toEqual(["late", "train-1", "stay-1"]);
});

test("计算住宿覆盖、待确认数量和明确费用", () => {
  const result = getTripReadiness({ ...DEMO_ITINERARY, travelers: 2, reservations: [
    { ...train, cost_scope: "per_person" },
    { ...stay, cost: 1200, cost_scope: "total" },
  ] });
  expect(result).toEqual({ confirmed: 1, planned: 1, coveredNights: 2, totalNights: 3, recordedCost: 1560 });
  expect(findReservationIssues({ ...DEMO_ITINERARY, reservations: [train, stay] }).map(issue => issue.code)).toContain("missing-stay");
});

test("取消记录仍可保存但不进入统计、覆盖或冲突", () => {
  const cancelled = { ...stay, status: "cancelled" as const };
  expect(getTripReadiness({ ...DEMO_ITINERARY, reservations: [cancelled] })).toMatchObject({ confirmed: 0, planned: 0, coveredNights: 0 });
  expect(isTravelReservation(cancelled)).toBe(true);
});

test("只报告同日真实时间重叠并允许跨午夜交通", () => {
  const overlap = { ...train, departure_at: "2026-10-02T10:15", arrival_at: "2026-10-02T11:00" };
  const overnight = { ...train, id: "night", departure_at: "2026-10-01T23:00", arrival_at: "2026-10-02T07:00" };
  const issues = findReservationIssues({ ...DEMO_ITINERARY, reservations: [overlap, overnight] });
  expect(issues.some(value => value.code === "activity-conflict" && value.message.includes("拙政园"))).toBe(true);
  expect(issues.some(value => value.reservationId === "night" && value.code === "outside-trip")).toBe(false);
});

test("交通预订不会和日程中同一段城际交通互相误报", () => {
  const issues = findReservationIssues({ ...DEMO_ITINERARY, reservations: [train] });
  expect(issues.some(value => value.code === "activity-conflict" && value.message.includes("南京 → 苏州"))).toBe(false);
});

test("仅把完全位于旅行范围外的记录提示为无关", () => {
  const before = { ...train, id: "before", departure_at: "2026-09-20T08:00", arrival_at: "2026-09-20T09:00" };
  const after = { ...stay, id: "after", check_in_date: "2026-11-01", check_out_date: "2026-11-02" };
  const ids = findReservationIssues({ ...DEMO_ITINERARY, reservations: [before, after] })
    .filter(value => value.code === "outside-trip").map(value => value.reservationId);
  expect(ids).toEqual(["before", "after"]);
});

test("日期未定时不宣称住宿已覆盖", () => {
  const flexible = { ...DEMO_ITINERARY, days: DEMO_ITINERARY.days.map(day => ({ ...day, date: null })) };
  expect(getTripReadiness(flexible)).toMatchObject({ coveredNights: 0, totalNights: 0 });
  expect(findReservationIssues(flexible).some(value => value.code === "missing-stay")).toBe(false);
});

test("结构守卫拒绝缺字段、错误枚举和非法日期", () => {
  expect(isTravelReservation(train)).toBe(true);
  expect(isTravelReservation({ ...train, mode: "spaceship" })).toBe(false);
  expect(isTravelReservation({ ...stay, check_in_date: "2026-02-30" })).toBe(false);
  expect(isTravelReservation({ id: "broken", kind: "transport" })).toBe(false);
});

test("旧预订允许缺少费用口径且显式费用口径只能使用合法枚举", () => {
  expect(isTravelReservation({ ...train, cost_scope: undefined })).toBe(true);
  expect(isTravelReservation({ ...train, cost_scope: "per_person" })).toBe(true);
  expect(isTravelReservation({ ...train, cost_scope: "hourly" })).toBe(false);
});
