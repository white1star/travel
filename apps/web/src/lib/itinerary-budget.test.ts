import { expect, test } from "vitest";

import { DEMO_ITINERARY } from "./demo-itinerary";
import {
  applyPerPersonAllocations,
  type BudgetCategorySummary,
  defaultBudgetAllocations,
  getBudgetOverview,
  getPerPersonAllocations,
  reservationGroupCost,
  validatePerPersonAllocations,
} from "./itinerary-budget";
import type {
  BudgetAllocations,
  BudgetCategory,
  Itinerary,
  StayReservation,
  TransportReservation,
  TravelReservation,
} from "./types";

function transport(overrides: Partial<TransportReservation> = {}): TransportReservation {
  return {
    id: "train-1",
    kind: "transport",
    mode: "train",
    status: "confirmed",
    title: "南京到苏州",
    departure_at: "2026-10-02T08:00",
    arrival_at: "2026-10-02T09:35",
    departure_place: "南京南站",
    arrival_place: "苏州站",
    ...overrides,
  };
}

function stay(overrides: Partial<StayReservation> = {}): StayReservation {
  return {
    id: "stay-1",
    kind: "stay",
    stay_type: "hotel",
    status: "confirmed",
    title: "平江路酒店",
    check_in_date: "2026-10-02",
    check_out_date: "2026-10-04",
    ...overrides,
  };
}

function tripWith(reservations: TravelReservation[], travelers = 2, budget: Partial<Itinerary["budget"]> = {}): Itinerary {
  return {
    ...structuredClone(DEMO_ITINERARY),
    travelers,
    reservations,
    budget: { ...structuredClone(DEMO_ITINERARY.budget), ...budget },
  };
}

function category(result: ReturnType<typeof getBudgetOverview>, key: BudgetCategory): BudgetCategorySummary {
  return result.categories.find(value => value.key === key)!;
}

const allocations: BudgetAllocations = {
  transport: 500,
  lodging: 800,
  food: 600,
  tickets: 120,
  local_transport: 160,
  other: 70,
};

test("将每人和整单预订统一换算为整团金额", () => {
  const result = getBudgetOverview(tripWith([
    transport({ cost: 180, cost_scope: "per_person" }),
    stay({ cost: 1200, cost_scope: "total" }),
  ]));

  expect(category(result, "transport")).toMatchObject({ plannedGroup: 360, plannedPerPerson: 180 });
  expect(category(result, "lodging")).toMatchObject({ plannedGroup: 1200, plannedPerPerson: 600 });
});

test("显式预订费用替代旧估算且未知费用触发不完整状态", () => {
  const result = category(getBudgetOverview(tripWith([
    transport({ id: "known", cost: 100, cost_scope: "per_person" }),
    transport({ id: "unknown", cost: undefined }),
    transport({ id: "cancelled", cost: 999, status: "cancelled" }),
  ], 2, { transport: 800 })), "transport");

  expect(result.plannedGroup).toBe(200);
  expect(result.incomplete).toBe(true);
  expect(result.sources.map(source => source.id)).toEqual(["known"]);
});

test("没有明确预订费用时沿用旧估算并标记金额可能不完整", () => {
  const result = category(getBudgetOverview(tripWith([
    transport({ cost: undefined }),
  ], 2, { transport: 800 })), "transport");

  expect(result.plannedGroup).toBe(800);
  expect(result.incomplete).toBe(true);
  expect(result.sources).toEqual([expect.objectContaining({ kind: "estimate", label: "行程生成估算" })]);
});

test("零元是明确费用而 undefined 才是未知费用", () => {
  const knownZero = category(getBudgetOverview(tripWith([
    transport({ cost: 0, cost_scope: "per_person" }),
  ], 2, { transport: 800 })), "transport");
  const unknown = category(getBudgetOverview(tripWith([
    transport({ cost: undefined }),
  ], 2, { transport: 800 })), "transport");

  expect(knownZero).toMatchObject({ plannedGroup: 0, incomplete: false });
  expect(knownZero.sources[0]).toMatchObject({ groupAmount: 0 });
  expect(unknown).toMatchObject({ plannedGroup: 800, incomplete: true });
});

test("旧费用口径按交通每人、住宿整单解释", () => {
  expect(reservationGroupCost(transport({ cost: 180 }), 2)).toBe(360);
  expect(reservationGroupCost(stay({ cost: 1200 }), 2)).toBe(1200);
});

test("旧行程分类估算生成默认额度且其他默认为零", () => {
  expect(defaultBudgetAllocations(DEMO_ITINERARY)).toEqual({
    transport: 900,
    lodging: 1380,
    food: 1440,
    tickets: 240,
    local_transport: 320,
    other: 0,
  });
});

test("人均额度只写入整团 allocations，不改写旧预算汇总", () => {
  const updated = applyPerPersonAllocations(DEMO_ITINERARY, allocations);

  expect(updated.budget.allocations).toEqual({
    transport: 1000,
    lodging: 1600,
    food: 1200,
    tickets: 240,
    local_transport: 320,
    other: 140,
  });
  expect(updated.budget.estimated_total).toBe(DEMO_ITINERARY.budget.estimated_total);
  expect(updated.budget.remaining).toBe(DEMO_ITINERARY.budget.remaining);
  expect(getPerPersonAllocations(updated)).toEqual(allocations);
});

test("汇总给出未分配差额和分类超支", () => {
  const trip = tripWith([], 2, {
    total_available: 6000,
    allocations: { transport: 200, lodging: 1600, food: 1200, tickets: 240, local_transport: 320, other: 0 },
  });
  const result = getBudgetOverview(trip);

  expect(result.allocatedGroup).toBe(3560);
  expect(result.allocationDifferencePerPerson).toBe(1220);
  expect(category(result, "transport")).toMatchObject({ isOver: true, differencePerPerson: -350 });
});

test("拒绝负数和非有限分类额度", () => {
  expect(validatePerPersonAllocations({ ...allocations, food: -1 })).toEqual({ food: "请输入大于或等于 0 的有效金额" });
  expect(validatePerPersonAllocations({ ...allocations, tickets: Number.NaN })).toEqual({ tickets: "请输入大于或等于 0 的有效金额" });
});
