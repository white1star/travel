import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import type { StayReservation, TransportReservation } from "@/lib/types";
import { TravelLogistics } from "./travel-logistics";

const train: TransportReservation = { id: "train-1", kind: "transport", mode: "train", status: "confirmed", title: "南京到苏州", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35", departure_place: "南京南站", arrival_place: "苏州站", cost: 180 };
const stay: StayReservation = { id: "stay-1", kind: "stay", stay_type: "hotel", status: "planned", title: "苏州酒店", check_in_date: "2026-10-02", check_out_date: "2026-10-04" };

test("展示准备度、住宿缺口和已取消记录但不计入统计", () => {
  render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [train, stay, { ...stay, id: "cancelled", title: "已取消酒店", status: "cancelled" }] }} draft={null} onDraftChange={() => undefined} onCommit={() => undefined} onDelete={() => undefined} />);
  expect(screen.getByText("已确认 1")).toBeInTheDocument();
  expect(screen.getByText("待确认 1")).toBeInTheDocument();
  expect(screen.getByText("住宿覆盖 2 / 3 晚")).toBeInTheDocument();
  expect(screen.getByText(/10月4日晚尚未安排住宿/)).toBeInTheDocument();
  expect(screen.getByText("已取消")).toBeInTheDocument();
});

test("删除必须二次确认且取消不会修改行程", async () => {
  const onDelete = vi.fn();
  render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [train] }} draft={null} onDraftChange={() => undefined} onCommit={() => undefined} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "删除南京到苏州" }));
  expect(screen.getByText(/删除后可在保存前撤销/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "取消删除" }));
  expect(onDelete).not.toHaveBeenCalled();
});

test("日期未定时不显示虚假的零晚覆盖", () => {
  const flexible = { ...DEMO_ITINERARY, days: DEMO_ITINERARY.days.map(day => ({ ...day, date: null })) };
  render(<TravelLogistics itinerary={flexible} draft={null} onDraftChange={() => undefined} onCommit={() => undefined} onDelete={() => undefined} />);
  expect(screen.getByText("日期确定后可检查住宿覆盖")).toBeInTheDocument();
  expect(screen.queryByText(/住宿覆盖 0 \/ 0 晚/)).not.toBeInTheDocument();
});

test("新增交通和住宿使用各自的默认费用口径", async () => {
  const onDraftChange = vi.fn();
  const view = render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [] }} draft={null} onDraftChange={onDraftChange} onCommit={() => undefined} onDelete={() => undefined} />);

  await userEvent.click(screen.getByRole("button", { name: "添加交通" }));
  expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "transport", cost_scope: "per_person" }));
  view.rerender(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [] }} draft={null} onDraftChange={onDraftChange} onCommit={() => undefined} onDelete={() => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: "添加住宿" }));
  expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "stay", cost_scope: "total" }));
});

test("卡片明确展示每人和整单费用且汇总使用整团口径", () => {
  render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, travelers: 2, reservations: [
    { ...train, cost: 180, cost_scope: "per_person" },
    { ...stay, cost: 1200, cost_scope: "total" },
  ] }} draft={null} onDraftChange={() => undefined} onCommit={() => undefined} onDelete={() => undefined} />);

  expect(screen.getByText("¥180/人")).toBeInTheDocument();
  expect(screen.getByText("整单 ¥1,200")).toBeInTheDocument();
  expect(screen.getByText("整团已录入预订费用")).toBeInTheDocument();
  expect(screen.getByText("¥1,560")).toBeInTheDocument();
});
