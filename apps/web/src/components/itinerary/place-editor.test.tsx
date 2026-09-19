import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import type { ItineraryItem } from "@/lib/types";
import { PlaceEditor } from "./place-editor";

afterEach(() => vi.unstubAllGlobals());

function configuredSearch() {
  vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(
    url.includes("/status") ? { search_available: true, map_available: false, js_key: null }
      : { places: [{ id: "B001", name: "苏州博物馆", address: "东北街204号", citycode: "0512", coordinate: [120.6277, 31.3241], category: "博物馆" }] },
  ), { status: 200, headers: { "Content-Type": "application/json" } }));
}

test("选中搜索结果后添加安排保留高德地点身份、地址和坐标", async () => {
  configuredSearch();
  let saved: ItineraryItem | undefined;
  render(<PlaceEditor city="苏州" onCommit={item => { saved = item; }} onCancel={() => undefined} />);
  await userEvent.type(screen.getByRole("textbox", { name: "搜索真实地点" }), "博物馆");
  await userEvent.click(await screen.findByRole("button", { name: "搜索地点" }));
  await userEvent.click(await screen.findByRole("button", { name: /选择苏州博物馆/ }));
  expect(screen.getByRole("textbox", { name: "地点名称" })).toHaveValue("苏州博物馆");
  await userEvent.click(screen.getByRole("button", { name: "添加到当天" }));
  expect(saved).toMatchObject({ name: "苏州博物馆", poi_id: "B001", address: "东北街204号", citycode: "0512", location_source: "amap", coordinate: [120.6277, 31.3241], verified_hours: false });
});

test("改写选中地点名称后不能继续使用旧地点的定位", async () => {
  configuredSearch();
  let saved: ItineraryItem | undefined;
  render(<PlaceEditor city="苏州" onCommit={item => { saved = item; }} onCancel={() => undefined} />);
  await userEvent.type(screen.getByRole("textbox", { name: "搜索真实地点" }), "博物馆");
  await userEvent.click(await screen.findByRole("button", { name: "搜索地点" }));
  await userEvent.click(await screen.findByRole("button", { name: /选择苏州博物馆/ }));
  await userEvent.clear(screen.getByRole("textbox", { name: "地点名称" }));
  await userEvent.type(screen.getByRole("textbox", { name: "地点名称" }), "休息集合");
  await userEvent.click(screen.getByRole("button", { name: "添加到当天" }));
  expect(saved?.coordinate).toEqual([0, 0]);
  expect(saved?.poi_id).toBeUndefined();
});

test("未配置服务时明确提示并保留手动添加能力", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ search_available: false, map_available: false, js_key: null })));
  let saved: ItineraryItem | undefined;
  render(<PlaceEditor city="苏州" onCommit={item => { saved = item; }} onCancel={() => undefined} />);
  expect(await screen.findByText(/地点搜索未配置/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "搜索地点" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "地点名称" }), "午休");
  await userEvent.click(screen.getByRole("button", { name: "添加到当天" }));
  expect(saved?.name).toBe("午休");
});

test("快速连续搜索只展示最后一次查询结果", async () => {
  let resolveFirst!: (value: Response) => void;
  let resolveSecond!: (value: Response) => void;
  vi.stubGlobal("fetch", (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/status")) return Promise.resolve(new Response(JSON.stringify({ search_available: true, map_available: false, js_key: null })));
    if (url.includes(encodeURIComponent("博物馆"))) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    return new Promise<Response>((resolve) => { resolveSecond = resolve; });
  });
  render(<PlaceEditor city="苏州" onCommit={() => undefined} onCancel={() => undefined} />);
  const input = screen.getByRole("textbox", { name: "搜索真实地点" });
  await userEvent.type(input, "博物馆");
  await userEvent.click(await screen.findByRole("button", { name: "搜索地点" }));
  await userEvent.clear(input);
  await userEvent.type(input, "园林");
  await userEvent.click(screen.getByRole("button", { name: "搜索地点" }));

  await act(async () => resolveSecond(new Response(JSON.stringify({ places: [{ id: "2", name: "留园", address: "留园路", citycode: "0512", coordinate: [120.59, 31.31], category: "园林" }] }))));
  expect(await screen.findByRole("button", { name: /选择留园/ })).toBeInTheDocument();
  await act(async () => resolveFirst(new Response(JSON.stringify({ places: [{ id: "1", name: "旧博物馆", address: "旧地址", citycode: "0512", coordinate: [120.6, 31.3], category: "博物馆" }] }))));
  expect(screen.queryByRole("button", { name: /选择旧博物馆/ })).not.toBeInTheDocument();
});
