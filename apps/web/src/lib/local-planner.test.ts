import { expect, test } from "vitest";

import type { TripDraft } from "./types";
import { createLocalItinerary } from "./local-planner";

const base: TripDraft = {
  mode: "known",
  origin: "上海",
  destinations: ["苏州", "杭州"],
  dateMode: "fixed",
  startDate: "2026-11-06",
  days: 4,
  travelers: 2,
  budgetPerPerson: 3000,
  pace: "balanced",
  interests: ["博物馆"],
  requiredPlaces: ["拙政园", "自选咖啡馆"],
  returnToOrigin: true,
};

test("必去地点锁定且未知地点不伪造定位", () => {
  const { itinerary } = createLocalItinerary(base, {
    id: "fixed",
    generatedAt: "2026-09-19T00:00:00.000Z",
  });
  const items = itinerary.days.flatMap(day => day.items);

  expect(items.find(item => item.name === "拙政园")).toMatchObject({ locked: true });
  expect(items.find(item => item.name === "自选咖啡馆")).toMatchObject({
    locked: true,
    coordinate: [0, 0],
    category: "用户必去 · 待定位",
  });
  expect(items.find(item => item.name === "自选咖啡馆")).not.toHaveProperty("location_source");
});

test("兴趣改变普通候选优先级", () => {
  const day = createLocalItinerary({
    ...base,
    destinations: ["苏州"],
    days: 1,
    pace: "compact",
    requiredPlaces: [],
  }).itinerary.days[0];

  expect(day.items[0].name).toBe("苏州博物馆");
  expect(day.items.findIndex(item => item.name === "苏州博物馆")).toBeLessThan(
    day.items.findIndex(item => item.name === "平江路"),
  );
});

test.each([
  ["relaxed", 2],
  ["balanced", 3],
  ["compact", 4],
] as const)("%s 节奏限制每天普通安排容量", (pace, capacity) => {
  const { itinerary } = createLocalItinerary({
    ...base,
    requiredPlaces: [],
    destinations: ["苏州"],
    days: 1,
    pace,
  });

  expect(itinerary.days[0].items).toHaveLength(capacity);
});

test("天数少于城市数时不伪造跨城日程并提示未排入城市", () => {
  const result = createLocalItinerary({
    ...base,
    destinations: ["苏州", "杭州", "成都"],
    days: 2,
  });

  expect(result.itinerary.days.map(day => day.city)).toEqual(["苏州", "杭州"]);
  expect(result.itinerary.route).toEqual(["上海", "苏州", "杭州", "成都", "上海"]);
  expect(result.notices.join(" ")).toContain("成都");
});

test("六类额度精确等于整团预算，预算为零时不加入普通付费地点", () => {
  const zero = createLocalItinerary({
    ...base,
    destinations: ["苏州"],
    days: 1,
    travelers: 20,
    budgetPerPerson: 0,
    requiredPlaces: [],
  });
  const zeroAllocations = Object.values(zero.itinerary.budget.allocations ?? {});
  expect(zeroAllocations.reduce((sum, value) => sum + value, 0)).toBe(0);
  expect(zero.itinerary.days[0].items.filter(item => item.cost > 0)).toHaveLength(0);

  const decimal = createLocalItinerary({ ...base, travelers: 20, budgetPerPerson: 1234.56 });
  const decimalTotal = Object.values(decimal.itinerary.budget.allocations ?? {})
    .reduce((sum, value) => sum + value, 0);
  expect(Math.round(decimalTotal * 100)).toBe(2_469_120);
});

test("固定日期递增而灵活日期保持为空", () => {
  expect(createLocalItinerary(base).itinerary.days.map(day => day.date)).toEqual([
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
    "2026-11-09",
  ]);
  expect(createLocalItinerary({ ...base, dateMode: "flexible" }).itinerary.days.every(day => day.date === null)).toBe(true);
});

test("重复必去地点只排一次，超出节奏容量时全部保留并提示", () => {
  const result = createLocalItinerary({
    ...base,
    destinations: ["成都"],
    days: 1,
    pace: "relaxed",
    requiredPlaces: ["甲", "甲", "乙", "丙"],
  });

  expect(result.itinerary.days[0].items.map(item => item.name)).toEqual(["甲", "乙", "丙"]);
  expect(result.notices.join(" ")).toContain("超过所选节奏");
});

test("目录中已知必去地点进入对应目的城市", () => {
  const result = createLocalItinerary({ ...base, requiredPlaces: ["灵隐寺"] });
  const day = result.itinerary.days.find(value => value.items.some(item => item.name === "灵隐寺"));

  expect(day?.city).toBe("杭州");
  expect(day?.items.find(item => item.name === "灵隐寺")?.locked).toBe(true);
});

test("未知城市不生成虚构地点", () => {
  const result = createLocalItinerary({
    ...base,
    destinations: ["成都"],
    days: 1,
    requiredPlaces: [],
  });

  expect(result.itinerary.days[0]).toMatchObject({ city: "成都", items: [] });
  expect(result.notices.join(" ")).toContain("待完善");
});

test("固定标识与时间时结果稳定，并使用明确的本地估算公式", () => {
  const options = { id: "fixed", generatedAt: "2026-09-19T00:00:00.000Z" };
  const first = createLocalItinerary(base, options).itinerary;
  const second = createLocalItinerary(base, options).itinerary;

  expect(second).toEqual(first);
  expect(first.route).toEqual(["上海", "苏州", "杭州", "上海"]);
  expect(first.budget.transport).toBe(720);
  expect(first.budget.lodging).toBe(1080);
  expect(first.budget.food).toBe(960);
  expect(first.budget.local_transport).toBe(320);
  expect(first.budget.tickets).toBe(
    first.days.flatMap(day => day.items).reduce((sum, item) => sum + item.cost * 2, 0),
  );
});

test("低门票预算跳过普通付费地点但不删除付费必去地点", () => {
  const ordinary = createLocalItinerary({
    ...base,
    destinations: ["苏州"],
    days: 1,
    budgetPerPerson: 100,
    requiredPlaces: [],
  }).itinerary.days[0].items;
  expect(ordinary.every(item => item.cost === 0)).toBe(true);

  const required = createLocalItinerary({
    ...base,
    destinations: ["苏州"],
    days: 1,
    budgetPerPerson: 0,
    requiredPlaces: ["拙政园"],
  }).itinerary.days[0].items;
  expect(required.find(item => item.name === "拙政园")).toMatchObject({ cost: 80, locked: true });
});
