import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { ItineraryItem } from "@/lib/types";
import { MapCanvas } from "./map-canvas";

afterEach(() => vi.unstubAllGlobals());

// Substitute only the external SDK boundary; keep our renderer and selection state real.
class Marker {
  content: HTMLElement;
  constructor(options: Record<string, unknown>) { this.content = options.content as HTMLElement; }
}
let mapOptions: Record<string, unknown> | undefined;
class SDKMap {
  constructor(private container: HTMLElement, options: Record<string, unknown>) { mapOptions = options; }
  on(event: string, callback: () => void) { if (event === "complete") queueMicrotask(callback); }
  add(overlays: unknown[]) { overlays.forEach(overlay => { if (overlay instanceof Marker) this.container.appendChild(overlay.content); }); }
  remove(overlays: unknown[]) { overlays.forEach(overlay => { if (overlay instanceof Marker) overlay.content.remove(); }); }
  setFitView() {}
  destroy() { this.container.replaceChildren(); }
}
const a: ItineraryItem = { name: "博物馆", coordinate: [120.62,31.32], location_source: "amap", poi_id: "B001", time: "10:00", end_time: "11:00", duration_minutes: 60, category: "景点", description: "", cost: 0, locked: false, verified_hours: false };
const b: ItineraryItem = { ...a, name: "园林", poi_id: "B002", coordinate: [120.63,31.33] };
function Harness({ items }: { items: ItineraryItem[] }) {
  const [active, setActive] = useState(0);
  return <><p>选中：{items[active]?.name}</p><MapCanvas items={items} activeIndex={active} onSelect={setActive} route={null} jsKey="public-test-key" /></>;
}

test("只渲染真实定位标记，点击联动选择，更新与卸载清除旧标记", async () => {
  vi.stubGlobal("AMap", { Map: SDKMap, Marker, Polyline: class {} });
  const demo = { ...a, name: "演示坐标", location_source: undefined };
  const { rerender, unmount } = render(<Harness items={[a,b,demo]} />);
  const marker = await screen.findByRole("button", { name: "地图选择园林" });
  expect(mapOptions?.center).toEqual(a.coordinate);
  expect(mapOptions?.center).not.toEqual([116.397428, 39.90923]);
  expect(screen.queryByRole("button", { name: "地图选择演示坐标" })).not.toBeInTheDocument();
  await userEvent.click(marker);
  expect(screen.getByText("选中：园林")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "地图选择园林" })).toHaveClass("is-active");
  rerender(<Harness items={[a]} />);
  expect(screen.queryByRole("button", { name: "地图选择园林" })).not.toBeInTheDocument();
  const currentMarker = screen.getByRole("button", { name: "地图选择博物馆" });
  unmount();
  expect(currentMarker.isConnected).toBe(false);
});
