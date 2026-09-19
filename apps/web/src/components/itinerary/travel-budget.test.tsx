import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import type { Itinerary, StayReservation, TransportReservation } from "@/lib/types";
import { TravelBudget } from "./travel-budget";

const train: TransportReservation = {
  id: "train", kind: "transport", mode: "train", status: "confirmed", title: "南京到苏州车票",
  departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35",
  departure_place: "南京南站", arrival_place: "苏州站", cost: 180, cost_scope: "per_person",
  provider: "绝密承运方", confirmation_number: "SECRET-TRAIN", notes: "绝密备注",
};
const hotel: StayReservation = {
  id: "hotel", kind: "stay", stay_type: "hotel", status: "confirmed", title: "平江路酒店",
  check_in_date: "2026-10-02", check_out_date: "2026-10-04", cost: 1200, cost_scope: "total",
  contact: "13800000000", confirmation_number: "SECRET-HOTEL", notes: "不要展示",
};

function renderBudget(itinerary: Itinerary = { ...DEMO_ITINERARY, reservations: [train, hotel] }) {
  return render(<TravelBudget itinerary={itinerary} draft={null} onStartEdit={() => undefined} onDraftChange={() => undefined} onCommit={() => undefined} onCancel={() => undefined} />);
}

test("默认突出人均总预算、计划支出和剩余并辅助展示整团金额", () => {
  renderBudget();
  const summary = screen.getByLabelText("预算总览");
  expect(within(summary).getByText("¥3,000")).toBeInTheDocument();
  expect(within(summary).getByText("¥1,780")).toBeInTheDocument();
  expect(within(summary).getByText("¥1,220")).toBeInTheDocument();
  expect(within(summary).getByText(/整团总预算 ¥6,000/)).toBeInTheDocument();
  expect(within(summary).getByText(/整团计划支出 ¥3,560/)).toBeInTheDocument();
});

test("展开交通来源只显示预算必要信息而不泄露预订隐私", async () => {
  renderBudget();
  await userEvent.click(screen.getByRole("button", { name: "查看交通费用来源" }));

  expect(screen.getByText("南京到苏州车票")).toBeInTheDocument();
  expect(screen.getByText("¥180/人")).toBeInTheDocument();
  expect(screen.queryByText("绝密承运方")).not.toBeInTheDocument();
  expect(screen.queryByText("SECRET-TRAIN")).not.toBeInTheDocument();
  expect(screen.queryByText("13800000000")).not.toBeInTheDocument();
  expect(screen.queryByText("不要展示")).not.toBeInTheDocument();
});

test("显示未分配、分类超支和金额不完整提醒且保留进度语义", () => {
  const trip: Itinerary = {
    ...DEMO_ITINERARY,
    budget: {
      ...DEMO_ITINERARY.budget,
      allocations: { transport: 200, lodging: 1000, food: 1000, tickets: 200, local_transport: 200, other: 0 },
    },
    reservations: [train, { ...hotel, cost: undefined }],
  };
  renderBudget(trip);

  expect(screen.getByText(/还有 ¥1,700\/人尚未分配/)).toBeInTheDocument();
  expect(screen.getByText(/交通预计超出 ¥80\/人/)).toBeInTheDocument();
  expect(screen.getByText(/住宿金额可能不完整/)).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "交通预算使用情况" })).toHaveAttribute("aria-valuetext", expect.stringContaining("超出"));
});

test("分类额度高于总预算时给出非阻塞提醒", () => {
  const trip: Itinerary = {
    ...DEMO_ITINERARY,
    budget: {
      ...DEMO_ITINERARY.budget,
      allocations: { transport: 2000, lodging: 2000, food: 2000, tickets: 1000, local_transport: 1000, other: 1000 },
    },
  };
  renderBudget(trip);
  expect(screen.getByText(/分类预算超出总预算 ¥1,500\/人/)).toBeInTheDocument();
});

test("全部计划费用为零时显示明确空状态", () => {
  const zero = {
    ...DEMO_ITINERARY,
    days: DEMO_ITINERARY.days.map(day => ({ ...day, date: null })),
    budget: { total_available: 0, estimated_total: 0, remaining: 0, transport: 0, lodging: 0, tickets: 0, local_transport: 0, food: 0, other: 0 },
    reservations: [],
  };
  renderBudget(zero);
  expect(screen.getByText("尚无可计算的计划费用")).toBeInTheDocument();
});
