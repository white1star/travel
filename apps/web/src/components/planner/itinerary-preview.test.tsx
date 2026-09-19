import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { createLocalItinerary } from "@/lib/local-planner";
import type { PlannerPreviewRecord } from "@/lib/planner-preview-store";
import type { TripDraft } from "@/lib/types";
import { ItineraryPreview } from "./itinerary-preview";

const draft: TripDraft = {
  mode: "known",
  origin: "南京",
  destinations: ["苏州", "杭州"],
  dateMode: "fixed",
  startDate: "2026-10-02",
  days: 4,
  travelers: 2,
  budgetPerPerson: 3000,
  pace: "balanced",
  interests: ["博物馆"],
  requiredPlaces: ["拙政园", "自选咖啡馆"],
  returnToOrigin: true,
};

function makeRecord(value: TripDraft = draft): PlannerPreviewRecord {
  return {
    version: 1,
    draft: value,
    ...createLocalItinerary(value, {
      id: "internal-preview-id",
      generatedAt: "2026-09-19T00:00:00.000Z",
    }),
  };
}

test("预览展示路线、每天安排、状态和六类预算", () => {
  render(<ItineraryPreview value={makeRecord()} saving={false} onBack={vi.fn()} onSave={vi.fn()} />);
  const preview = screen.getByRole("region", { name: "行程预览" });

  expect(within(preview).getByRole("heading", { name: "先看看这份行程" })).toBeInTheDocument();
  expect(within(preview).getByText("南京 → 苏州 → 杭州 → 南京")).toBeInTheDocument();
  expect(within(preview).getByText("人均 ¥3,000")).toBeInTheDocument();
  expect(within(preview).getByText("整团 ¥6,000")).toBeInTheDocument();
  expect(within(preview).getAllByRole("article")).toHaveLength(4);
  expect(within(preview).getAllByText("必去").length).toBeGreaterThan(0);
  expect(within(preview).getAllByText("待定位").length).toBeGreaterThan(0);
  for (const label of ["交通", "住宿", "餐饮", "门票", "市内交通", "其他"]) {
    expect(within(preview).getByText(label)).toBeInTheDocument();
  }
});

test("预览提供返回修改和单次确认保存入口", async () => {
  const onBack = vi.fn();
  const onSave = vi.fn();
  const { rerender } = render(
    <ItineraryPreview value={makeRecord()} saving={false} onBack={onBack} onSave={onSave} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  await userEvent.click(screen.getByRole("button", { name: "确认保存行程" }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(onSave).toHaveBeenCalledOnce();

  rerender(<ItineraryPreview value={makeRecord()} saving onBack={onBack} onSave={onSave} />);
  expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
  expect(screen.getByRole("region", { name: "行程预览" })).toHaveAttribute("aria-busy", "true");
});

test("未知城市展示待完善空状态且不泄露内部定位数据", () => {
  const unknown = makeRecord({
    ...draft,
    destinations: ["成都"],
    days: 1,
    requiredPlaces: [],
  });
  render(<ItineraryPreview value={unknown} saving={false} onBack={vi.fn()} onSave={vi.fn()} />);

  expect(screen.getByText("当天地点待完善")).toBeInTheDocument();
  expect(screen.getByText(/本地点位尚未收录/)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("[0,0]");
  expect(document.body).not.toHaveTextContent("120.6295");
  expect(document.body).not.toHaveTextContent(unknown.itinerary.id);
});

test("灵活日期与超预算提醒使用可读文字而不是只靠颜色", () => {
  const record = makeRecord({ ...draft, dateMode: "flexible", budgetPerPerson: 0 });
  render(<ItineraryPreview value={record} saving={false} onBack={vi.fn()} onSave={vi.fn()} />);

  expect(screen.getByText("日期待定 · 4 天")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/超过总预算/);
});
