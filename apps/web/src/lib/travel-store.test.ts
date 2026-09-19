import { beforeEach, expect, test } from "vitest";
import * as store from "./travel-store";

import { DEMO_ITINERARY } from "./demo-itinerary";
import {
  deleteTrip,
  readSelectedTrip,
  readTrips,
  saveTrip,
  selectTrip,
} from "./travel-store";

beforeEach(() => localStorage.clear());

test("保存多份行程并按最近更新排序，同一 ID 不重复", () => {
  saveTrip({ ...DEMO_ITINERARY, id: "a", title: "行程 A" });
  saveTrip({ ...DEMO_ITINERARY, id: "b", title: "行程 B" });
  saveTrip({ ...DEMO_ITINERARY, id: "a", title: "更新后的行程 A" });

  expect(readTrips().map((trip) => trip.title)).toEqual([
    "更新后的行程 A",
    "行程 B",
  ]);
  expect(readSelectedTrip()?.id).toBe("a");
});

test("可以选择和删除行程", () => {
  saveTrip({ ...DEMO_ITINERARY, id: "a", title: "行程 A" });
  saveTrip({ ...DEMO_ITINERARY, id: "b", title: "行程 B" });

  selectTrip("a");
  expect(readSelectedTrip()?.title).toBe("行程 A");

  deleteTrip("a");
  expect(readTrips().map((trip) => trip.id)).toEqual(["b"]);
  expect(readSelectedTrip()?.id).toBe("b");
});

test("旧版单份行程会自动兼容且损坏数据不会阻塞页面", () => {
  localStorage.setItem(
    "travel:last-itinerary",
    JSON.stringify({ ...DEMO_ITINERARY, travelers: undefined }),
  );

  expect(readTrips()).toHaveLength(1);
  expect(readTrips()[0].travelers).toBe(2);

  localStorage.setItem("travel:trips:v1", "broken-json");
  expect(readTrips()).toHaveLength(1);
});

test("最后一份行程移入回收站后不会从旧数据复活，刷新后可恢复", () => {
  localStorage.setItem("travel:last-itinerary", JSON.stringify({ ...DEMO_ITINERARY, id: "legacy" }));
  deleteTrip("legacy");
  expect(readTrips()).toEqual([]);
  expect(readSelectedTrip()).toBeNull();
  expect(store.readDeletedTrips()[0].trip.id).toBe("legacy");
  store.restoreTrip("legacy");
  expect(readTrips().map(trip => trip.id)).toEqual(["legacy"]);
  expect(store.readDeletedTrips()).toEqual([]);
});

test("重命名校验空名称，复制使用独立 ID 和独立内容", () => {
  saveTrip({ ...DEMO_ITINERARY, id: "original" });
  expect(() => store.renameTrip("original", "  ")).toThrow();
  store.renameTrip("original", "  清新旅行  ");
  const copy = store.duplicateTrip("original");
  expect(copy.id).not.toBe("original");
  expect(copy.title).toBe("清新旅行（副本）");
  copy.days[0].items[0].name = "副本专用";
  saveTrip(copy);
  expect(readTrips().find(trip => trip.id === "original")?.days[0].items[0].name).not.toBe("副本专用");
});

test("永久删除只移除回收站中的指定行程", () => {
  saveTrip({ ...DEMO_ITINERARY, id: "a" });
  saveTrip({ ...DEMO_ITINERARY, id: "b" });
  deleteTrip("a");
  store.permanentlyDeleteTrip("a");
  expect(store.readDeletedTrips()).toEqual([]);
  expect(readTrips().map(trip => trip.id)).toEqual(["b"]);
});

test("迁移后永久删除同时清除旧版持久副本", () => {
  localStorage.setItem("travel:trips:v1", JSON.stringify([{ ...DEMO_ITINERARY, id: "old" }]));
  localStorage.setItem("travel:last-itinerary", JSON.stringify({ ...DEMO_ITINERARY, id: "old" }));
  deleteTrip("old");
  store.permanentlyDeleteTrip("old");
  expect(localStorage.getItem("travel:trips:v1")).toBeNull();
  expect(localStorage.getItem("travel:last-itinerary")).toBeNull();
});

test("存储写入失败时不会丢失原行程或宣告删除成功", () => {
  saveTrip({ ...DEMO_ITINERARY, id: "keep" });
  const failing: Storage = { length: localStorage.length, clear: () => {}, key: index => localStorage.key(index), getItem: key => localStorage.getItem(key), removeItem: () => {}, setItem: () => { throw new Error("quota"); } };
  expect(() => deleteTrip("keep", failing)).toThrow("quota");
  expect(readTrips().map(trip => trip.id)).toEqual(["keep"]);
});

test("旧行程缺少交通住宿字段时自动补为空列表并能正常保存", () => {
  const oldTrip = { ...DEMO_ITINERARY } as Record<string, unknown>;
  delete oldTrip.reservations;
  localStorage.setItem("travel:last-itinerary", JSON.stringify(oldTrip));

  expect(readTrips()[0].reservations).toEqual([]);
  saveTrip(readTrips()[0]);
  expect(readTrips()[0].reservations).toEqual([]);
});

test("新版存储中的损坏预订会明确报错且不会改写原始内容", () => {
  const damaged = {
    version: 2,
    trips: [{ ...DEMO_ITINERARY, reservations: [{ id: "broken", kind: "transport" }] }],
    trash: [],
    selectedId: DEMO_ITINERARY.id,
  };
  const raw = JSON.stringify(damaged);
  localStorage.setItem("travel:library:v2", raw);

  expect(() => readTrips()).toThrow("行程数据无法读取");
  expect(localStorage.getItem("travel:library:v2")).toBe(raw);
});

test("读取旧行程时补出分类额度和预订费用口径", () => {
  const oldTrip = {
    ...DEMO_ITINERARY,
    budget: { ...DEMO_ITINERARY.budget, allocations: undefined },
    reservations: [
      {
        id: "old-train", kind: "transport", mode: "train", status: "confirmed", title: "旧车票",
        departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35",
        departure_place: "南京南站", arrival_place: "苏州站", cost: 180,
      },
      {
        id: "old-stay", kind: "stay", stay_type: "hotel", status: "planned", title: "旧酒店",
        check_in_date: "2026-10-02", check_out_date: "2026-10-04", cost: 1200,
      },
    ],
  };
  localStorage.setItem("travel:last-itinerary", JSON.stringify(oldTrip));

  const trip = readTrips()[0];
  expect(trip.budget.allocations).toEqual({
    transport: 900,
    lodging: 1380,
    food: 1440,
    tickets: 240,
    local_transport: 320,
    other: 0,
  });
  expect(trip.reservations?.find(item => item.kind === "transport")?.cost_scope).toBe("per_person");
  expect(trip.reservations?.find(item => item.kind === "stay")?.cost_scope).toBe("total");
});

test.each([
  ["缺少分类", { budget: { ...DEMO_ITINERARY.budget, allocations: { transport: 1 } } }],
  ["负数分类", { budget: { ...DEMO_ITINERARY.budget, allocations: { transport: -1, lodging: 1, food: 1, tickets: 1, local_transport: 1, other: 1 } } }],
  ["非法费用口径", { reservations: [{ id: "bad", kind: "transport", mode: "train", status: "confirmed", title: "坏数据", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:00", departure_place: "A", arrival_place: "B", cost_scope: "hourly" }] }],
  ["非法同行人数", { travelers: 0 }],
])("新版存储遇到%s时拒绝整份数据且保留原文", (_label, change) => {
  const damaged = {
    version: 2,
    trips: [{ ...DEMO_ITINERARY, ...change }],
    trash: [],
    selectedId: DEMO_ITINERARY.id,
  };
  const raw = JSON.stringify(damaged);
  localStorage.setItem("travel:library:v2", raw);

  expect(() => readTrips()).toThrow("行程数据无法读取");
  expect(localStorage.getItem("travel:library:v2")).toBe(raw);
});

test("新版预算与费用口径保存后可完整重开", () => {
  const trip = {
    ...DEMO_ITINERARY,
    budget: {
      ...DEMO_ITINERARY.budget,
      allocations: { transport: 1000, lodging: 1600, food: 1200, tickets: 240, local_transport: 320, other: 140 },
    },
    reservations: [
      { id: "train", kind: "transport" as const, mode: "train" as const, status: "confirmed" as const, title: "车票", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:00", departure_place: "A", arrival_place: "B", cost: 180, cost_scope: "per_person" as const },
      { id: "hotel", kind: "stay" as const, stay_type: "hotel" as const, status: "confirmed" as const, title: "酒店", check_in_date: "2026-10-02", check_out_date: "2026-10-05", cost: 1200, cost_scope: "total" as const },
    ],
  };

  saveTrip(trip);
  expect(readSelectedTrip()?.budget.allocations).toEqual(trip.budget.allocations);
  expect(readSelectedTrip()?.reservations?.map(value => value.cost_scope)).toEqual(["per_person", "total"]);
});
