import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import type { DayRecommendationResponse } from "@/lib/recommendations";
import { AiDayRecommendations } from "./ai-day-recommendations";

afterEach(() => vi.unstubAllGlobals());

function recommendationResponse(summary = "兼顾少步行和室内体验"): DayRecommendationResponse {
  return {
    recommendations: [
      { poi_id: "museum", name: "苏州博物馆(本馆)", address: "东北街204号", citycode: "0512", coordinate: [120.6277, 31.3241], category: "博物馆", time: "13:30", end_time: "15:00", duration_minutes: 90, cost: 0, reason: "室内且顺路", notice: "开放时间与费用需确认" },
      { poi_id: "garden", name: "网师园", address: "阔家头巷11号", citycode: "0512", coordinate: [120.63, 31.30], category: "园林", time: "15:30", end_time: "17:00", duration_minutes: 90, cost: 40, reason: "傍晚游览舒适", notice: "开放时间与费用需确认" },
      { poi_id: "food", name: "本地餐厅", address: "平江路", citycode: "0512", coordinate: [120.64, 31.31], category: "餐饮", time: "18:00", end_time: "19:00", duration_minutes: 60, cost: 80, reason: "品尝本地菜", notice: "开放时间与费用需确认" },
    ],
    summary,
    warnings: ["开放时间需确认"],
  };
}

test("用户预览并选择部分 AI 推荐后才加入当天", async () => {
  const apply = vi.fn();
  const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(recommendationResponse()), { status: 200 })));
  render(<AiDayRecommendations itinerary={DEMO_ITINERARY} dayIndex={0} onApply={apply} onClose={close} />);
  const user = userEvent.setup();

  const input = screen.getByRole("textbox", { name: "补充你的要求" });
  expect(input).toHaveAttribute("maxLength", "300");
  await user.type(input, "带老人，少走路");
  await user.click(screen.getByRole("button", { name: "生成推荐" }));

  expect(await screen.findByText("兼顾少步行和室内体验")).toBeInTheDocument();
  expect(screen.getByText("开放时间需确认")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "不选择网师园" }));
  await user.click(screen.getByRole("button", { name: "加入当天" }));

  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls[0][0].map((item: { name: string }) => item.name)).toEqual(["苏州博物馆(本馆)", "本地餐厅"]);
  expect(apply.mock.calls[0][0][0]).toEqual(expect.objectContaining({ poi_id: "museum", location_source: "amap", notice: "AI 推荐 · 开放时间与费用需确认" }));
  expect(close).toHaveBeenCalledTimes(1);
});

test("取消全部推荐后不能写入行程", async () => {
  const apply = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(recommendationResponse()), { status: 200 })));
  render(<AiDayRecommendations itinerary={DEMO_ITINERARY} dayIndex={0} onApply={apply} onClose={() => undefined} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "生成推荐" }));
  await screen.findByText("兼顾少步行和室内体验");

  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);

  expect(screen.getByRole("button", { name: "加入当天" })).toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
});

test("推荐失败会保留输入并允许重试", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "AI 推荐额度不足" }), { status: 503 })));
  render(<AiDayRecommendations itinerary={DEMO_ITINERARY} dayIndex={0} onApply={() => undefined} onClose={() => undefined} />);
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: "补充你的要求" });
  await user.type(input, "下午下雨，安排室内");
  await user.click(screen.getByRole("button", { name: "生成推荐" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("AI 推荐额度不足");
  expect(input).toHaveValue("下午下雨，安排室内");
  expect(screen.getByRole("button", { name: "重试推荐" })).toBeEnabled();
});

test("与已有安排冲突时明确提示并可重新排程预览", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(recommendationResponse()), { status: 200 })));
  render(<AiDayRecommendations itinerary={DEMO_ITINERARY} dayIndex={0} onApply={() => undefined} onClose={() => undefined} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "生成推荐" }));

  expect(await screen.findAllByText("加入后建议重新排程")).not.toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "按建议重新排程" }));

  expect(screen.getByText("推荐时间已顺延，确认后再写入行程。")).toBeInTheDocument();
});

test("切换日期会取消旧请求且旧结果不能覆盖新日期", async () => {
  let firstSignal: AbortSignal | null = null;
  let call = 0;
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
    call += 1;
    if (call === 1) {
      firstSignal = options.signal ?? null;
      return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }
    return Promise.resolve(new Response(JSON.stringify(recommendationResponse("第二天推荐")), { status: 200 }));
  }));
  const props = { itinerary: DEMO_ITINERARY, onApply: () => undefined, onClose: () => undefined };
  const { rerender } = render(<AiDayRecommendations {...props} dayIndex={0} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "生成推荐" }));

  rerender(<AiDayRecommendations {...props} dayIndex={1} />);
  expect((firstSignal as AbortSignal | null)?.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "生成推荐" }));

  expect(await screen.findByText("第二天推荐")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("兼顾少步行和室内体验")).not.toBeInTheDocument());
});
