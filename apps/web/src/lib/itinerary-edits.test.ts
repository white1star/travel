import { expect, test } from "vitest";

import { DEMO_ITINERARY } from "./demo-itinerary";
import {
  addItem,
  addRecommendedItems,
  analyzeDaySchedule,
  clearDayItems,
  duplicateDayItems,
  findScheduleConflicts,
  moveItemToDay,
  moveScheduleItem,
  replaceItem,
  removeItem,
  shiftItemTime,
  swapDestinationOrder,
  updateItemTiming,
} from "./itinerary-edits";

const manualItem = { ...DEMO_ITINERARY.days[0].items[2], name: "咖啡休息", time: "12:00", end_time: "13:00", duration_minutes: 60, cost: 30, coordinate: [0, 0] as [number, number] };

test("添加安排按时间排序并按同行人数增加费用，不修改原行程", () => {
  const next = addItem(DEMO_ITINERARY, 0, manualItem);
  expect(next.days[0].items.map(item => item.time)).toEqual(["08:00", "10:00", "12:00", "13:30", "16:10"]);
  expect(next.budget.estimated_total).toBe(4340);
  expect(next.budget.remaining).toBe(1660);
  expect(DEMO_ITINERARY.days[0].items).toHaveLength(4);
});

test("替换普通地点更新费用，必去地点不能被替换", () => {
  expect(replaceItem(DEMO_ITINERARY, 0, 1, manualItem)).toBe(DEMO_ITINERARY);
  const next = replaceItem(DEMO_ITINERARY, 0, 2, manualItem);
  expect(next.days[0].items.some(item => item.name === "苏州博物馆")).toBe(false);
  expect(next.budget.estimated_total).toBe(4340);
});

test("跨天移动保留必去标记和预算，同城限制避免未经校验的跨城路线", () => {
  const next = moveItemToDay(DEMO_ITINERARY, 0, 1, 1);
  expect(next.days[0].items).toHaveLength(3);
  expect(next.days[1].items.find(item => item.name === "拙政园")?.locked).toBe(true);
  expect(next.budget).toEqual(DEMO_ITINERARY.budget);
  expect(moveItemToDay(DEMO_ITINERARY, 0, 1, 2)).toBe(DEMO_ITINERARY);
  expect(moveItemToDay(DEMO_ITINERARY, 0, 1, -1)).toBe(DEMO_ITINERARY);
});

test("重叠安排会被标记，正常时间段不误报", () => {
  expect(findScheduleConflicts(DEMO_ITINERARY.days[0].items)).toEqual([]);
  const next = addItem(DEMO_ITINERARY, 0, { ...manualItem, time: "10:30", end_time: "11:30" });
  expect(findScheduleConflicts(next.days[0].items)).toEqual(["拙政园与咖啡休息的时间重叠"]);
});

test("无效安排和越界位置不会污染行程", () => {
  expect(addItem(DEMO_ITINERARY, 0, { ...manualItem, cost: -1 })).toBe(DEMO_ITINERARY);
  expect(addItem(DEMO_ITINERARY, 0, { ...manualItem, name: " " })).toBe(DEMO_ITINERARY);
  expect(addItem(DEMO_ITINERARY, 0, { ...manualItem, time: "bad" })).toBe(DEMO_ITINERARY);
  expect(addItem(DEMO_ITINERARY, 99, manualItem)).toBe(DEMO_ITINERARY);
});

test("时间调整不跨越午夜，调整后时间轴仍按时间排序", () => {
  expect(shiftItemTime(DEMO_ITINERARY, 0, 1, -660)).toBe(DEMO_ITINERARY);
  expect(shiftItemTime(DEMO_ITINERARY, 0, 1, 900)).toBe(DEMO_ITINERARY);
  const next = shiftItemTime(DEMO_ITINERARY, 0, 2, -300);
  expect(next.days[0].items.map(item => item.time)).toEqual(["08:00", "08:30", "10:00", "16:10"]);
});

test("地点变更后清除原有通勤估算，避免沿用不再适用的路线", () => {
  const added = addItem(DEMO_ITINERARY, 0, manualItem);
  expect(added.days[0].items.filter(item => item.category !== "城际交通").every(item => !item.transport && !item.transport_minutes)).toBe(true);
  const replaced = replaceItem(DEMO_ITINERARY, 0, 2, manualItem);
  expect(replaced.days[0].items[3].transport).toBeNull();
  const removed = removeItem(DEMO_ITINERARY, 0, 2);
  expect(removed.days[0].items[2].transport).toBeNull();
});

test("自定义费用独立记账，移除城际交通不误扣门票预算", () => {
  const added = addItem(DEMO_ITINERARY, 0, { ...manualItem, category: "自定义安排" });
  expect(added.budget.other).toBe(60);
  expect(added.budget.tickets).toBe(240);
  const removed = removeItem(DEMO_ITINERARY, 0, 0);
  expect(removed.budget.transport).toBe(540);
  expect(removed.budget.tickets).toBe(240);
  expect(removed.budget.estimated_total).toBe(3920);
});

test("安排时间可以整体前后移动且不修改原行程", () => {
  const result = shiftItemTime(DEMO_ITINERARY, 0, 1, 30);

  expect(result.days[0].items[1].time).toBe("10:30");
  expect(result.days[0].items[1].end_time).toBe("12:00");
  expect(DEMO_ITINERARY.days[0].items[1].time).toBe("10:00");
});

test("必去地点不可删除，普通地点删除后同步减少预算", () => {
  expect(removeItem(DEMO_ITINERARY, 0, 1)).toBe(DEMO_ITINERARY);

  const result = removeItem(DEMO_ITINERARY, 0, 2);
  expect(result.days[0].items.some((item) => item.name === "苏州博物馆")).toBe(false);
  expect(result.budget.estimated_total).toBe(DEMO_ITINERARY.budget.estimated_total);
});

test("交换两个目的城市时同步调整路线与每日城市分组", () => {
  const result = swapDestinationOrder(DEMO_ITINERARY);

  expect(result.route).toEqual(["南京", "杭州", "苏州", "南京"]);
  expect(result.days.map((day) => day.city)).toEqual(["杭州", "杭州", "苏州", "苏州"]);
  expect(result.days.map((day) => day.date)).toEqual([
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
  ]);
});

test("同日向下移动按最终位置插入并重新排程", () => {
  const next = moveScheduleItem(DEMO_ITINERARY, {
    fromDayIndex: 0,
    fromItemIndex: 1,
    toDayIndex: 0,
    toItemIndex: 3,
  });

  expect(next.days[0].items.map((item) => item.name)).toEqual([
    "南京 → 苏州",
    "苏州博物馆",
    "平江路",
    "拙政园",
  ]);
  expect(next.days[0].items.map((item) => item.time)).toEqual(["08:00", "10:05", "12:35", "14:25"]);
  expect(next.days[0].items.filter((item) => item.category !== "城际交通").every((item) => item.transport == null)).toBe(true);
  expect(DEMO_ITINERARY.days[0].items[1].name).toBe("拙政园");
});

test("同日原位移动不产生新对象，首尾和越界安全处理", () => {
  expect(moveScheduleItem(DEMO_ITINERARY, { fromDayIndex: 0, fromItemIndex: 1, toDayIndex: 0, toItemIndex: 1 })).toBe(DEMO_ITINERARY);
  expect(moveScheduleItem(DEMO_ITINERARY, { fromDayIndex: 0, fromItemIndex: -1, toDayIndex: 0, toItemIndex: 1 })).toBe(DEMO_ITINERARY);
  const next = moveScheduleItem(DEMO_ITINERARY, { fromDayIndex: 0, fromItemIndex: 3, toDayIndex: 0, toItemIndex: 0 });
  expect(next.days[0].items[0].name).toBe("平江路");
});

test("跨日移动只允许同城并重新排程两个日期", () => {
  const next = moveScheduleItem(DEMO_ITINERARY, { fromDayIndex: 0, fromItemIndex: 2, toDayIndex: 1, toItemIndex: 1 });
  expect(next.days[0].items.map((item) => item.name)).not.toContain("苏州博物馆");
  expect(next.days[1].items.map((item) => item.name)).toEqual(["留园", "苏州博物馆", "山塘街"]);
  expect(next.days[1].items.map((item) => item.time)).toEqual(["09:30", "11:30", "14:00"]);
  expect(next.budget).toEqual(DEMO_ITINERARY.budget);
  expect(moveScheduleItem(DEMO_ITINERARY, { fromDayIndex: 0, fromItemIndex: 1, toDayIndex: 2, toItemIndex: 0 })).toBe(DEMO_ITINERARY);
});

test("复制当天只添加目标日缺少的地点并增加实际新增费用", () => {
  const source = structuredClone(DEMO_ITINERARY);
  source.days[0].items[1].poi_id = "poi-garden";
  source.days[1].items.push({ ...structuredClone(source.days[0].items[1]), time: "18:30", end_time: "20:00" });
  const next = duplicateDayItems(source, 0, 1);

  expect(next.days[1].items.filter((item) => item.poi_id === "poi-garden")).toHaveLength(1);
  expect(next.days[1].items.some((item) => item.name === "苏州博物馆")).toBe(true);
  expect(next.budget.transport).toBe(source.budget.transport + 180 * source.travelers);
  expect(next.budget.estimated_total).toBe(source.budget.estimated_total + 180 * source.travelers);
  expect(duplicateDayItems(source, 0, 2)).toBe(source);
});

test("清空当天保留锁定地点并扣减普通地点费用", () => {
  const next = clearDayItems(DEMO_ITINERARY, 0);
  expect(next.days[0].items.map((item) => item.name)).toEqual(["拙政园"]);
  expect(next.days[0].items[0].time).toBe("08:00");
  expect(next.budget.estimated_total).toBe(DEMO_ITINERARY.budget.estimated_total - 180 * DEMO_ITINERARY.travelers);
  expect(clearDayItems(next, 0)).toBe(next);
});

test("精确时间更新会计算结束时间、排序并拒绝跨午夜", () => {
  const next = updateItemTiming(DEMO_ITINERARY, 0, 2, "09:00", 45);
  expect(next.days[0].items[1].name).toBe("苏州博物馆");
  expect(next.days[0].items[1].end_time).toBe("09:45");
  expect(next.days[0].items[1].transport).toBeNull();
  expect(updateItemTiming(DEMO_ITINERARY, 0, 2, "23:30", 60)).toBe(DEMO_ITINERARY);
  expect(updateItemTiming(DEMO_ITINERARY, 0, 2, "bad", 60)).toBe(DEMO_ITINERARY);
});

test("诊断重叠、晚结束、过密与待定位", () => {
  const day = structuredClone(DEMO_ITINERARY.days[0]);
  day.intensity = "轻松";
  day.items[1].time = "08:30";
  day.items[1].end_time = "10:00";
  day.items.at(-1)!.time = "18:30";
  day.items.at(-1)!.end_time = "20:10";
  day.items[2].location_source = "amap";
  day.items[2].coordinate = [120.62, 31.32];
  const issues = analyzeDaySchedule(day);

  expect(issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["overlap", "late", "dense", "unlocated"]));
  expect(issues.filter((issue) => issue.kind === "unlocated").map((issue) => issue.itemIndexes)).not.toContainEqual([2]);
});

test("AI 推荐只加入新的有效高德地点并按实际新增费用更新预算", () => {
  const original = structuredClone(DEMO_ITINERARY);
  original.days[0].items[1].poi_id = "existing";
  original.days[0].items[1].location_source = "amap";
  const duplicate = { ...structuredClone(original.days[0].items[1]), time: "12:00", end_time: "13:30" };
  const museum = {
    ...manualItem,
    name: "苏州丝绸博物馆",
    category: "博物馆",
    time: "12:00",
    end_time: "13:00",
    cost: 20,
    coordinate: [120.61, 31.31] as [number, number],
    poi_id: "museum-ai",
    location_source: "amap" as const,
  };
  const restaurant = {
    ...manualItem,
    name: "本地餐厅",
    category: "餐饮",
    time: "18:00",
    end_time: "19:00",
    cost: 50,
    coordinate: [120.62, 31.32] as [number, number],
    poi_id: "food-ai",
    location_source: "amap" as const,
  };

  const next = addRecommendedItems(original, 0, [duplicate, museum, restaurant]);

  expect(next.days[0].items.map((item) => item.name)).toEqual(expect.arrayContaining(["苏州丝绸博物馆", "本地餐厅"]));
  expect(next.days[0].items.filter((item) => item.poi_id === "existing")).toHaveLength(1);
  expect(next.budget.tickets).toBe(original.budget.tickets + 20 * original.travelers);
  expect(next.budget.food).toBe(original.budget.food + 50 * original.travelers);
  expect(next.budget.estimated_total).toBe(original.budget.estimated_total + 70 * original.travelers);
  expect(original.days[0].items).toHaveLength(4);
});

test("AI 推荐按名称去重并拒绝未定位、非法时间或越界日期", () => {
  const sameName = {
    ...manualItem,
    name: " 苏州 博物馆 ",
    coordinate: [120.62, 31.32] as [number, number],
    poi_id: "same-name",
    location_source: "amap" as const,
  };
  const unlocated = { ...sameName, name: "无定位", poi_id: "unlocated", coordinate: [0, 0] as [number, number] };
  const crossMidnight = { ...sameName, name: "跨午夜", poi_id: "late", time: "23:30", end_time: "00:30" };

  expect(addRecommendedItems(DEMO_ITINERARY, 0, [sameName, unlocated, crossMidnight])).toBe(DEMO_ITINERARY);
  expect(addRecommendedItems(DEMO_ITINERARY, 99, [sameName])).toBe(DEMO_ITINERARY);
});

test("AI 推荐批次内部重复只加入一次且清除旧通勤估算", () => {
  const recommendation = {
    ...manualItem,
    name: "网师园",
    category: "园林",
    coordinate: [120.63, 31.3] as [number, number],
    poi_id: "garden-ai",
    location_source: "amap" as const,
  };

  const sameNameDifferentPoi = { ...structuredClone(recommendation), poi_id: "garden-ai-alias", name: " 网师 园 " };
  const next = addRecommendedItems(DEMO_ITINERARY, 0, [recommendation, structuredClone(recommendation), sameNameDifferentPoi]);

  expect(next.days[0].items.filter((item) => item.poi_id === "garden-ai")).toHaveLength(1);
  expect(next.days[0].items.filter((item) => item.name.replace(/\s+/g, "") === "网师园")).toHaveLength(1);
  expect(next.days[0].items.filter((item) => item.category !== "城际交通").every((item) => item.transport == null)).toBe(true);
});
