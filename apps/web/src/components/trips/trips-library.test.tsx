import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import { readSelectedTrip, saveTrip } from "@/lib/travel-store";
import { TripsLibrary } from "./trips-library";
import type { TransportReservation } from "@/lib/types";

const train: TransportReservation = { id: "train-1", kind: "transport", mode: "train", status: "planned", title: "南京到苏州", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35", departure_place: "南京南站", arrival_place: "苏州站", confirmation_number: "PRIVATE-123" };

beforeEach(() => localStorage.clear());

test("展示已保存行程并可将其设为当前行程", async () => {
  saveTrip({ ...DEMO_ITINERARY, id: "spring", title: "春日苏杭" });
  saveTrip({ ...DEMO_ITINERARY, id: "autumn", title: "秋日苏杭" });
  render(<TripsLibrary navigate={() => undefined} confirmDelete={() => true} />);

  expect(await screen.findByRole("heading", { name: "秋日苏杭" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "打开春日苏杭" }));

  expect(readSelectedTrip()?.id).toBe("spring");
});

test("删除最后一份行程后显示创建入口", async () => {
  saveTrip({ ...DEMO_ITINERARY, id: "only", title: "唯一行程" });
  render(<TripsLibrary navigate={() => undefined} confirmDelete={() => true} />);

  await userEvent.click(await screen.findByRole("button", { name: "删除唯一行程" }));

  expect(screen.getByRole("heading", { name: "还没有保存的旅行" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "创建第一份行程" })).toHaveAttribute("href", "/plan/new");
});

test("搜索按名称和城市筛选，重命名后可复制独立行程", async () => {
  saveTrip({ ...DEMO_ITINERARY, id: "one", title: "春日旅行" });
  saveTrip({ ...DEMO_ITINERARY, id: "two", title: "海边旅行", route: ["厦门"] });
  render(<TripsLibrary navigate={() => undefined} />);
  await userEvent.type(await screen.findByRole("searchbox", { name: "搜索行程" }), "苏州");
  expect(screen.queryByRole("heading", { name: "海边旅行" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "重命名春日旅行" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "行程名称" }));
  await userEvent.type(screen.getByRole("textbox", { name: "行程名称" }), "春日苏州");
  await userEvent.click(screen.getByRole("button", { name: "保存名称" }));
  await userEvent.click(screen.getByRole("button", { name: "复制春日苏州" }));
  expect(screen.getByRole("heading", { name: "春日苏州（副本）" })).toBeInTheDocument();
});

test("删除后可在回收站恢复，永久删除先显示确认再取消", async () => {
  saveTrip({ ...DEMO_ITINERARY, id: "one", title: "春日旅行" });
  render(<TripsLibrary navigate={() => undefined} confirmDelete={() => true} />);
  await userEvent.click(await screen.findByRole("button", { name: "删除春日旅行" }));
  await userEvent.click(screen.getByRole("button", { name: /回收站/ }));
  await userEvent.click(screen.getByRole("button", { name: "永久删除春日旅行" }));
  expect(screen.getByText(/永久删除后无法恢复/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  await userEvent.click(screen.getByRole("button", { name: "恢复春日旅行" }));
  await userEvent.click(screen.getByRole("button", { name: /全部行程/ }));
  expect(screen.getByRole("heading", { name: "春日旅行" })).toBeInTheDocument();
});

test("其他标签页更新创建草稿不会清空正在输入的行程名称", async () => {
  saveTrip({ ...DEMO_ITINERARY, id: "one", title: "春日旅行" });
  render(<TripsLibrary navigate={() => undefined} />);
  await userEvent.click(await screen.findByRole("button", { name: "重命名春日旅行" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "行程名称" }));
  await userEvent.type(screen.getByRole("textbox", { name: "行程名称" }), "正在填写");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "travel:planner-draft:v1" })));
  expect(screen.getByRole("textbox", { name: "行程名称" })).toHaveValue("正在填写");
});

test("行程卡片显示预订准备状态但不展示完整编号", async () => {
  saveTrip({ ...DEMO_ITINERARY, reservations: [train] });
  render(<TripsLibrary navigate={() => undefined} />);
  expect(await screen.findByText("1 项待确认")).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE-123")).not.toBeInTheDocument();
});
