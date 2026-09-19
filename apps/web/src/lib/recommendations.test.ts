import { afterEach, expect, test, vi } from "vitest";

import {
  recommendationToItem,
  requestDayRecommendations,
  type DayRecommendationRequest,
  type DayRecommendationResponse,
} from "./recommendations";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const payload: DayRecommendationRequest = {
  city: "苏州",
  date: "2026-10-02",
  intensity: "轻松",
  travelers: 2,
  remaining_budget_total: 1720,
  existing_items: [{ name: "拙政园", time: "10:00", end_time: "11:30", poi_id: "garden" }],
  request: "带老人，少走路",
};

const response: DayRecommendationResponse = {
  recommendations: [{
    poi_id: "museum",
    name: "苏州博物馆",
    address: "东北街204号",
    citycode: "0512",
    coordinate: [120.6277, 31.3241],
    category: "博物馆",
    time: "13:30",
    end_time: "15:00",
    duration_minutes: 90,
    cost: 0,
    reason: "室内且顺路",
    notice: "开放时间与费用需出发前确认",
  }],
  summary: "兼顾少步行和室内体验",
  warnings: [],
};

test("AI 推荐客户端只向本地后端发送规范上下文并返回结构化结果", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    expect(new URL(url).pathname).toBe("/api/recommendations/day");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(options.body))).toEqual(payload);
    return new Response(JSON.stringify(response), { status: 200 });
  }));

  const result = await requestDayRecommendations(payload);

  expect(result).toEqual(response);
});

test("AI 推荐客户端展示后端安全错误而不是伪造空结果", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "AI 推荐额度不足" }), { status: 503 })));

  await expect(requestDayRecommendations(payload)).rejects.toThrow("AI 推荐额度不足");
});

test("AI 推荐客户端区分网络断开和用户取消", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
  await expect(requestDayRecommendations(payload)).rejects.toThrow("AI 推荐服务暂未连接");

  const controller = new AbortController();
  controller.abort();
  await expect(requestDayRecommendations(payload, controller.signal)).rejects.toThrow("AI 推荐已取消或超时");
});

test("AI 推荐为一次自动重试保留六十秒窗口", async () => {
  vi.useFakeTimers();
  let requestSignal: AbortSignal | null | undefined;
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    requestSignal = options.signal;
    options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));

  const request = requestDayRecommendations(payload);
  const rejection = expect(request).rejects.toThrow("AI 推荐已取消或超时");
  await vi.advanceTimersByTimeAsync(25_000);
  expect(requestSignal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(35_000);

  await rejection;
});

test("结构化推荐转换为可定位但仍需确认的行程项", () => {
  expect(recommendationToItem(response.recommendations[0])).toEqual({
    name: "苏州博物馆",
    category: "博物馆",
    time: "13:30",
    end_time: "15:00",
    duration_minutes: 90,
    description: "室内且顺路",
    cost: 0,
    locked: false,
    verified_hours: false,
    notice: "AI 推荐 · 开放时间与费用需确认",
    coordinate: [120.6277, 31.3241],
    poi_id: "museum",
    address: "东北街204号",
    citycode: "0512",
    location_source: "amap",
  });
});
