import { afterEach, expect, test, vi } from "vitest";
import { searchPlaces, requestRoute, isLocated, getMapsApiBase } from "./maps";

afterEach(() => vi.unstubAllGlobals());

test("真实路线只接受已标明来源的有效坐标，不拿演示坐标冒充", () => {
  expect(isLocated({ coordinate: [120.62, 31.32] })).toBe(false);
  expect(isLocated({ coordinate: [0, 0], location_source: "amap" })).toBe(false);
  expect(isLocated({ coordinate: [120.62, 31.32], location_source: "amap" })).toBe(true);
});

test("生产环境未配置后端时不请求访客本机", () => {
  expect(getMapsApiBase("travel.example.com", "")).toBeNull();
  expect(getMapsApiBase("127.0.0.1", "")).toBe("http://127.0.0.1:8000");
});

test("搜索带入城市约束，服务失败会抛出错误而不是返回假结果", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    const request = new URL(url);
    expect(request.searchParams.get("query")).toBe("博物馆");
    expect(request.searchParams.get("city")).toBe("苏州");
    return new Response(JSON.stringify({ detail: "地点服务不可用" }), { status: 502 });
  });
  await expect(searchPlaces("博物馆", "苏州")).rejects.toThrow("地点服务不可用");
});

test("路线请求传递交通方式和城市编码，返回真实距离耗时", async () => {
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    expect(JSON.parse(options.body as string)).toEqual({ origin: [120.62, 31.32], destination: [120.63, 31.33], mode: "transit", citycode: "0512", destination_citycode: "0512" });
    return new Response(JSON.stringify({ mode: "transit", distance_meters: 850, duration_seconds: 620, polyline: [[120.62, 31.32], [120.63, 31.33]] }));
  });
  const result = await requestRoute({ coordinate: [120.62, 31.32], citycode: "0512" }, { coordinate: [120.63, 31.33], citycode: "0512" }, "transit");
  expect(result.distance_meters).toBe(850);
  expect(result.duration_seconds).toBe(620);
});
