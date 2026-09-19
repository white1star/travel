import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import { readSelectedTrip, saveTrip } from "@/lib/travel-store";
import { ItineraryView } from "./itinerary-view";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test("手动添加地点可以保存并重开，未定位地点不伪造地图标记", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("button", { name: "添加安排" }));
  await userEvent.type(screen.getByRole("textbox", { name: "地点名称" }), "咖啡休息");
  await userEvent.click(screen.getByRole("button", { name: "添加到当天" }));
  expect(screen.getByRole("heading", { name: "咖啡休息" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /\d 咖啡休息/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  expect(readSelectedTrip()?.days[0].items.some(item => item.name === "咖啡休息")).toBe(true);
});

test("移动当天唯一安排后展示空状态而不是崩溃", async () => {
  const trip = structuredClone(DEMO_ITINERARY);
  trip.days[0].items = [trip.days[0].items[1]];
  render(<ItineraryView itinerary={trip} />);
  await userEvent.click(screen.getByRole("button", { name: "调整行程" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "移动到日期" }), "1");
  await userEvent.click(screen.getByRole("button", { name: "移动安排" }));
  expect(screen.getByText("当天还没有安排")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: /D2 苏州/ }));
  expect(screen.getByRole("heading", { name: "拙政园" })).toBeInTheDocument();
});

test("替换普通安排更新保存内容，必去地点不可替换", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("heading", { name: "拙政园" }));
  await userEvent.click(screen.getByRole("button", { name: "调整行程" }));
  expect(screen.getByRole("button", { name: "替换地点" })).toBeDisabled();
  await userEvent.click(screen.getByRole("heading", { name: "苏州博物馆" }));
  await userEvent.click(screen.getByRole("button", { name: "替换地点" }));
  await userEvent.type(screen.getByRole("textbox", { name: "地点名称" }), "午后茶馆");
  await userEvent.click(screen.getByRole("button", { name: "确认替换" }));
  expect(screen.queryByRole("heading", { name: "苏州博物馆" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  expect(readSelectedTrip()?.days[0].items[2].name).toBe("午后茶馆");
});

test("城市重排会关闭编辑器，避免替换错误的城市地点", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  await userEvent.click(screen.getByRole("button", { name: "调整行程" }));
  await userEvent.click(screen.getByRole("button", { name: "替换地点" }));
  await userEvent.type(screen.getByRole("textbox", { name: "地点名称" }), "苏州咖啡店");
  await userEvent.click(screen.getByRole("button", { name: "修改顺序" }));
  expect(screen.queryByRole("form", { name: "替换地点" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "西湖" })).toBeInTheDocument();
});

test("同名安排调整后保持选中原来的那一次", async () => {
  const trip = structuredClone(DEMO_ITINERARY);
  trip.days[0].items = [
    { ...trip.days[0].items[2], name: "咖啡休息", time: "12:00", end_time: "12:30" },
    { ...trip.days[0].items[2], name: "咖啡休息", time: "13:00", end_time: "13:30" },
  ];
  render(<ItineraryView itinerary={trip} onSave={saveTrip} />);
  await userEvent.click(screen.getAllByRole("heading", { name: "咖啡休息" })[1]);
  await userEvent.click(screen.getByRole("button", { name: "调整行程" }));
  await userEvent.click(screen.getByRole("button", { name: "延后 30 分钟" }));
  await userEvent.click(screen.getByRole("button", { name: "延后 30 分钟" }));
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  expect(readSelectedTrip()?.days[0].items.map(item => item.time)).toEqual(["12:00", "14:00"]);
});

test("时间轴附近提供编辑入口，不必滚动到地图底部", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  await userEvent.click(screen.getByRole("button", { name: "编辑选中安排" }));
  expect(screen.getByRole("region", { name: "行程调整" })).toBeInTheDocument();
});

test("AI 推荐经过确认后一次写入、自动保存且可以整步撤销", async () => {
  const save = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    recommendations: [{
      poi_id: "ai-garden",
      name: "网师园",
      address: "阔家头巷11号",
      citycode: "0512",
      coordinate: [120.6302, 31.3045],
      category: "园林",
      time: "18:00",
      end_time: "19:00",
      duration_minutes: 60,
      cost: 40,
      reason: "傍晚游览更舒适",
      notice: "开放时间与费用需确认",
    }],
    summary: "补充一处傍晚园林",
    warnings: ["开放时间需确认"],
  }), { status: 200 })));
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={save} />);

  await userEvent.click(screen.getByRole("button", { name: "AI 推荐" }));
  await userEvent.click(screen.getByRole("button", { name: "生成推荐" }));
  await screen.findByText("补充一处傍晚园林");
  await userEvent.click(screen.getByRole("button", { name: "加入当天" }));

  expect(screen.getByRole("heading", { name: "网师园" })).toBeInTheDocument();
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 1500 });
  expect(save.mock.calls[0][0].days[0].items.some((item: { poi_id?: string }) => item.poi_id === "ai-garden")).toBe(true);

  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.queryByRole("heading", { name: "网师园" })).not.toBeInTheDocument();
});

test("行程页同时展示日程、地图路线和预算", () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);

  expect(screen.getByRole("heading", { name: "苏杭四日游" })).toBeInTheDocument();
  expect(screen.getByLabelText("路线地图")).toBeInTheDocument();
  expect(screen.getByText("预算预估")).toBeInTheDocument();
  expect(screen.getByText("拙政园")).toBeInTheDocument();
});


test("切换日期后展示对应城市安排", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);

  await userEvent.click(screen.getByRole("tab", { name: /D3 杭州/ }));

  expect(screen.getAllByText("西湖").length).toBeGreaterThan(0);
  expect(screen.queryByText("拙政园")).not.toBeInTheDocument();
});

test("使用行程人数并在保存后给出反馈", async () => {
  render(<ItineraryView itinerary={{ ...DEMO_ITINERARY, travelers: 5 }} onSave={saveTrip} />);

  expect(screen.getAllByText(/5 人同行/).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));

  await waitFor(() => expect(screen.getByLabelText("保存状态")).toHaveTextContent("已自动保存"));
  expect(readSelectedTrip()?.travelers).toBe(5);
});

test("调整选中安排后可以撤销", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);

  await userEvent.click(screen.getByRole("heading", { name: "拙政园" }));
  await userEvent.click(screen.getByRole("button", { name: "调整行程" }));
  await userEvent.click(screen.getByRole("button", { name: "延后 30 分钟" }));
  expect(screen.getByText("10:30")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByText("10:00")).toBeInTheDocument();
});

test("修改顺序会交换苏州和杭州", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);

  await userEvent.click(screen.getByRole("button", { name: "修改顺序" }));

  expect(within(screen.getByLabelText("行程路线")).getAllByText(/南京|苏州|杭州/).map((item) => item.textContent)).toEqual([
    "南京",
    "杭州",
    "苏州",
    "南京",
  ]);
});

test("保存失败仍显示未保存状态并保留修改，重试成功后更新状态", async () => {
  let fail = true;
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={trip => { if (fail) throw new Error("quota"); saveTrip(trip); }} />);
  await userEvent.click(screen.getByRole("button", { name: "修改顺序" }));
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  await waitFor(() => expect(screen.getByLabelText("保存状态")).toHaveTextContent("已自动保存"));
});

test("取消离开时拦截站内链接且保留未保存修改", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<><a href="/trips/">站内导航测试</a><ItineraryView itinerary={DEMO_ITINERARY} onSave={saveTrip} /></>);
  await userEvent.click(screen.getByRole("button", { name: "修改顺序" }));
  const allowed = screen.getByRole("link", { name: "站内导航测试" }).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  expect(allowed).toBe(false);
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  confirm.mockRestore();
});

test("交通住宿修改进入现有未保存、撤销和保存闭环", async () => {
  render(<ItineraryView itinerary={{ ...DEMO_ITINERARY, reservations: [] }} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  await userEvent.click(screen.getByRole("button", { name: "添加交通" }));
  await userEvent.type(screen.getByLabelText("交通名称"), "南京到苏州");
  await userEvent.type(screen.getByLabelText("出发地点"), "南京南站");
  await userEvent.type(screen.getByLabelText("到达地点"), "苏州站");
  fireEvent.change(screen.getByLabelText("出发时间"), { target: { value: "2026-10-02T08:00" } });
  fireEvent.change(screen.getByLabelText("到达时间"), { target: { value: "2026-10-02T09:35" } });
  await userEvent.click(screen.getByRole("button", { name: "保存交通" }));
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  expect(screen.getByRole("heading", { name: "南京到苏州" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.queryByRole("heading", { name: "南京到苏州" })).not.toBeInTheDocument();
});

test("切换工作区不会丢失未提交表单且全局保存会提示先处理草稿", async () => {
  const save = vi.fn();
  render(<ItineraryView itinerary={{ ...DEMO_ITINERARY, reservations: [] }} onSave={save} />);
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  await userEvent.click(screen.getByRole("button", { name: "添加住宿" }));
  await userEvent.type(screen.getByLabelText("住宿名称"), "苏州酒店");
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  await userEvent.click(screen.getByRole("tab", { name: "日程" }));
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));
  expect(screen.getByRole("status")).toHaveTextContent("请先保存或取消正在编辑的交通住宿信息");
  expect(save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  expect(screen.getByLabelText("住宿名称")).toHaveValue("苏州酒店");
});

test("预算草稿跨工作区保留并阻止全局保存", async () => {
  const save = vi.fn();
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={save} />);
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  await userEvent.click(screen.getByRole("button", { name: "编辑分类预算" }));
  await userEvent.clear(screen.getByLabelText("交通预算（每人）"));
  await userEvent.type(screen.getByLabelText("交通预算（每人）"), "500");
  await userEvent.click(screen.getByRole("tab", { name: "日程" }));
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));

  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("请先确认或取消正在编辑的预算");
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  expect(screen.getByLabelText("交通预算（每人）")).toHaveValue(500);
});

test("确认预算进入未保存状态并可撤销", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  await userEvent.click(screen.getByRole("button", { name: "编辑分类预算" }));
  fireEvent.change(screen.getByLabelText("交通预算（每人）"), { target: { value: "500" } });
  await userEvent.click(screen.getByRole("button", { name: "确认分类预算" }));

  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  expect(screen.getByText("额度 ¥500/人")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByText("额度 ¥450/人")).toBeInTheDocument();
});

test("确认并保存预算后本地行程可恢复整团额度", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  await userEvent.click(screen.getByRole("button", { name: "编辑分类预算" }));
  fireEvent.change(screen.getByLabelText("交通预算（每人）"), { target: { value: "500" } });
  await userEvent.click(screen.getByRole("button", { name: "确认分类预算" }));
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));

  expect(readSelectedTrip()?.budget.allocations?.transport).toBe(1000);
  await waitFor(() => expect(screen.getByLabelText("保存状态")).toHaveTextContent("已自动保存"));
});

test("按钮排序与精确时间编辑都能更新当天安排", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  await userEvent.click(screen.getByRole("heading", { name: "拙政园" }));
  await userEvent.click(screen.getByRole("button", { name: "编辑选中安排" }));
  await userEvent.click(screen.getByRole("button", { name: "下移选中安排" }));
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "南京 → 苏州",
    "苏州博物馆",
    "拙政园",
    "平江路",
  ]);

  fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "15:00" } });
  fireEvent.change(screen.getByLabelText("停留分钟"), { target: { value: "60" } });
  await userEvent.click(screen.getByRole("button", { name: "更新时间" }));
  expect(screen.getByText("15:00")).toBeInTheDocument();
  expect(screen.getByText("16:00")).toBeInTheDocument();
});

test("桌面拖拽到末项与原位放下行为稳定", () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  const transfer = { effectAllowed: "move", dropEffect: "move", setData: vi.fn(), getData: vi.fn() };
  const first = screen.getByLabelText("选择安排：南京 → 苏州");
  const last = screen.getByLabelText("选择安排：平江路");
  fireEvent.dragStart(first, { dataTransfer: transfer });
  fireEvent.dragOver(last, { dataTransfer: transfer });
  fireEvent.drop(last, { dataTransfer: transfer });
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent).at(-1)).toBe("南京 → 苏州");

  const moved = screen.getByLabelText("选择安排：南京 → 苏州");
  fireEvent.dragStart(moved, { dataTransfer: transfer });
  fireEvent.drop(moved, { dataTransfer: transfer });
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent).at(-1)).toBe("南京 → 苏州");
});

test("原生拖拽以 DataTransfer 中的来源索引为准", () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  const last = screen.getByLabelText("选择安排：平江路");
  const transfer = { effectAllowed: "move", dropEffect: "move", setData: vi.fn(), getData: vi.fn(() => "0") };
  fireEvent.drop(last, { dataTransfer: transfer });
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "拙政园",
    "苏州博物馆",
    "平江路",
    "南京 → 苏州",
  ]);
});

test("复制当天会去重，清空当天保留必去地点", async () => {
  render(<ItineraryView itinerary={DEMO_ITINERARY} />);
  await userEvent.click(screen.getByRole("button", { name: "复制当天" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "复制到日期" }), "1");
  await userEvent.click(screen.getByRole("button", { name: "确认复制" }));
  await userEvent.click(screen.getByRole("tab", { name: /D2 苏州/ }));
  expect(screen.getByRole("heading", { name: "拙政园" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("tab", { name: /D1 苏州/ }));
  await userEvent.click(screen.getByRole("button", { name: "清空普通安排" }));
  await userEvent.click(screen.getByRole("button", { name: "确认清空" }));
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["拙政园"]);
});
