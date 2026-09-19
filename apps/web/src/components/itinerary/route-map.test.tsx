import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ItineraryItem } from "@/lib/types";
import { RouteMap } from "./route-map";

afterEach(() => vi.unstubAllGlobals());
const a: ItineraryItem = { name: "博物馆", coordinate: [120.62, 31.32], location_source: "amap", poi_id: "B001", citycode: "0512", time: "10:00", end_time: "11:00", duration_minutes: 60, category: "景点", description: "", cost: 0, locked: false, verified_hours: false };
const b: ItineraryItem = { ...a, name: "园林", poi_id: "B002", time: "12:00", end_time: "13:00", coordinate: [120.63, 31.33] };

test("未配置地图时明确提示而不是画假的地图或路线", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ search_available: false, map_available: false, js_key: null })));
  render(<RouteMap items={[a,b]} activeIndex={0} onSelect={() => undefined} />);
  expect(await screen.findByText(/真实地图未配置/)).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "当日路线连线" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "计算路线" })).toBeDisabled();
});

test("相邻真实地点计算交通耗时，切换交通方式后不保留旧结果", async () => {
  vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(url.includes("/status")
    ? { search_available: true, map_available: false, js_key: null }
    : { mode: "walking", distance_meters: 850, duration_seconds: 620, polyline: [[120.62,31.32],[120.63,31.33]] })));
  render(<RouteMap items={[a,b]} activeIndex={0} onSelect={() => undefined} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "计算路线" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "计算路线" }));
  expect(await screen.findByText(/850 米.*11 分钟/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "交通方式" }), "driving");
  expect(screen.queryByText(/850 米.*11 分钟/)).not.toBeInTheDocument();
});

test("未定位安排隔开两站时不能跨过它们伪造相邻路段", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ search_available: true, map_available: false, js_key: null })));
  render(<RouteMap items={[a,{...a,name:"休息",coordinate:[0,0],location_source:undefined},b]} activeIndex={0} onSelect={() => undefined} />);
  expect(screen.getByRole("button", { name: "计算路线" })).toBeDisabled();
  expect(screen.getByText(/连续两个已定位地点/)).toBeInTheDocument();
});

test("底图已配置但路线服务未配置时解释为何不能计算", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ search_available: false, map_available: true, js_key: "public-js-key" })));
  render(<RouteMap items={[a,b]} activeIndex={0} onSelect={() => undefined} />);
  expect(await screen.findByText(/路线服务未配置/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "计算路线" })).toBeDisabled();
});

test("切换方式后忽略尚未返回的旧路线", async () => {
  let resolveRoute!: (response: Response) => void;
  vi.stubGlobal("fetch", (url: string) => url.includes("/status")
    ? Promise.resolve(new Response(JSON.stringify({ search_available: true, map_available: false, js_key: null })))
    : new Promise<Response>(resolve => { resolveRoute = resolve; }));
  render(<RouteMap items={[a,b]} activeIndex={0} onSelect={() => undefined} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "计算路线" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "计算路线" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "交通方式" }), "driving");
  await act(async () => resolveRoute(new Response(JSON.stringify({ mode: "walking", distance_meters: 850, duration_seconds: 620, polyline: [] }))));
  expect(screen.queryByText(/850 米.*11 分钟/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "计算路线" })).toBeEnabled();
});

test("底图可用但当天没有真实定位时显示空状态而不创建默认城市地图", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ search_available: true, map_available: true, js_key: "public-js-key" })));
  render(<RouteMap items={[{ ...a, coordinate: [0, 0], location_source: undefined }]} activeIndex={0} onSelect={() => undefined} />);
  expect(await screen.findByText(/添加真实定位地点后显示地图/)).toBeInTheDocument();
  expect(screen.queryByLabelText("高德地图")).not.toBeInTheDocument();
});
