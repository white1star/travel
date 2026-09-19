import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createLocalItinerary } from "@/lib/local-planner";
import {
  PLANNER_PREVIEW_KEY,
  writePlannerDraft,
  writePlannerPreview,
  type PlannerDraftRecord,
  type PlannerPreviewRecord,
} from "@/lib/planner-preview-store";
import { readTrips } from "@/lib/travel-store";
import { PlannerWizard } from "./planner-wizard";

afterEach(() => { window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => localStorage.clear());

const savedDraft: PlannerDraftRecord = {
  version: 1,
  draft: {
    mode: "known",
    origin: "南京",
    destinations: ["苏州", "杭州"],
    dateMode: "fixed",
    startDate: "2026-10-02",
    days: 4,
    travelers: 2,
    budgetPerPerson: 3000,
    pace: "balanced",
    interests: ["园林古迹"],
    requiredPlaces: ["拙政园"],
    returnToOrigin: true,
  },
  destinationText: "苏州、杭州",
  requiredText: "拙政园",
  step: 1,
};

function oldPreview(): PlannerPreviewRecord {
  return { version: 1, draft: savedDraft.draft, ...createLocalItinerary(savedDraft.draft) };
}

async function generatePreview() {
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "生成行程预览" }));
  return screen.findByRole("region", { name: "行程预览" });
}

test("创建页可以跳过可选偏好直接确认", async () => {
  render(<PlannerWizard />);
  expect(screen.getByRole("textbox", { name: "目的城市" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  expect(screen.getByRole("heading", { name: "确认后生成预览" })).toBeInTheDocument();
});

test("空目的地和越界天数不能进入下一步", async () => {
  render(<PlannerWizard />);
  await userEvent.clear(screen.getByRole("textbox", { name: "目的城市" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("alert")).toHaveTextContent("目的城市");
  await userEvent.type(screen.getByRole("textbox", { name: "目的城市" }), "苏州");
  await userEvent.clear(screen.getByRole("spinbutton", { name: "旅行天数" }));
  await userEvent.type(screen.getByRole("spinbutton", { name: "旅行天数" }), "31");
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("alert")).toHaveTextContent("1–30");
});

test("离开后恢复未完成草稿，首页的新参数优先", async () => {
  const first = render(<PlannerWizard />);
  await userEvent.clear(screen.getByRole("textbox", { name: "目的城市" }));
  await userEvent.type(screen.getByRole("textbox", { name: "目的城市" }), "成都");
  first.unmount();
  const second = render(<PlannerWizard />);
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("成都");
  second.unmount();
  window.history.replaceState(null, "", "/plan/new?destination=杭州&days=2");
  render(<PlannerWizard />);
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("杭州");
  expect(screen.getByRole("spinbutton", { name: "旅行天数" })).toHaveValue(2);
});

test("无效偏好预算不会阻止返回偏好页修正，恢复草稿也可修正", async () => {
  const first = render(<PlannerWizard />);
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.clear(screen.getByRole("spinbutton", { name: /^每人预算/ }));
  fireEvent.change(screen.getByRole("spinbutton", { name: /^每人预算/ }), { target: { value: "-1" } });
  await userEvent.click(screen.getByRole("button", { name: "上一步" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("spinbutton", { name: /^每人预算/ })).toHaveValue(-1);
  first.unmount();
  render(<PlannerWizard />);
  await userEvent.clear(screen.getByRole("spinbutton", { name: /^每人预算/ }));
  await userEvent.type(screen.getByRole("spinbutton", { name: /^每人预算/ }), "2000");
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("heading", { name: "确认后生成预览" })).toBeInTheDocument();
});

test("首页填写的目的地和天数带入基础信息并保留节奏", async () => {
  window.history.replaceState(null, "", "/plan/new?destination=%E6%9D%AD%E5%B7%9E%E3%80%81%E8%8B%8F%E5%B7%9E&days=6&pace=relaxed");
  render(<PlannerWizard />);
  expect(await screen.findByRole("heading", { name: "从哪里出发？" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("杭州、苏州");
  expect(screen.getByRole("spinbutton", { name: "旅行天数" })).toHaveValue(6);
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("button", { name: "轻松" })).toHaveAttribute("aria-pressed", "true");
});

test("无效快速规划参数不覆盖默认值", async () => {
  window.history.replaceState(null, "", "/plan/new?destination=%20%20&days=-5&pace=wrong");
  render(<PlannerWizard />);
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("苏州、杭州");
  expect(screen.getByRole("spinbutton", { name: "旅行天数" })).toHaveValue(4);
});


test("创建页直接进入基础信息，避免重复选择入口", async () => {
  render(<PlannerWizard />);


  expect(screen.getByRole("heading", { name: "从哪里出发？" })).toBeInTheDocument();
  expect(screen.getByLabelText("出发城市")).toHaveValue("南京");
});


test("用户可以在向导中进入旅行偏好步骤", async () => {
  render(<PlannerWizard />);
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));

  expect(screen.getByRole("heading", { name: "这趟旅行想怎么玩？" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "适中" })).toHaveAttribute("aria-pressed", "true");
});

test("生成只创建预览，确认后才保存并进入详情", async () => {
  const save = vi.fn();
  const navigate = vi.fn();
  render(<PlannerWizard onSave={save} navigate={navigate} />);

  await generatePreview();
  expect(save).not.toHaveBeenCalled();
  await userEvent.dblClick(screen.getByRole("button", { name: "确认保存行程" }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("/trips/demo");
});

test("默认保存把同一预览写入行程库且不会产生副本", async () => {
  render(<PlannerWizard navigate={vi.fn()} />);
  await generatePreview();
  await userEvent.dblClick(screen.getByRole("button", { name: "确认保存行程" }));

  expect(readTrips()).toHaveLength(1);
  expect(readTrips()[0].title).toBe("苏州杭州4日游");
  expect(localStorage.getItem(PLANNER_PREVIEW_KEY)).toBeNull();
  expect(localStorage.getItem("travel:planner-draft:v1")).toBeNull();
});

test("保存失败保留预览并允许重试", async () => {
  const save = vi.fn().mockImplementationOnce(() => { throw new Error("quota"); });
  render(<PlannerWizard onSave={save} navigate={vi.fn()} />);
  await generatePreview();
  await userEvent.click(screen.getByRole("button", { name: "确认保存行程" }));

  expect(screen.getByRole("alert")).toHaveTextContent("未保存");
  expect(screen.getByRole("region", { name: "行程预览" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认保存行程" })).toBeEnabled();
});

test("恢复草稿时回到原步骤，确认页可返回直接修改", async () => {
  const first = render(<PlannerWizard />);
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  first.unmount();
  render(<PlannerWizard />);
  expect(screen.getByRole("heading", { name: "确认后生成预览" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "修改基本信息" }));
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("苏州、杭州");
});

test("清空草稿需要确认，确认后清空地点并返回第一步", async () => {
  render(<PlannerWizard />);
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "清空重填" }));
  await userEvent.click(screen.getByRole("button", { name: "确认清空草稿" }));
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "出发城市" })).toHaveValue("");
});

test("刷新恢复生成预览，返回修改会清除旧预览但保留输入", async () => {
  const first = render(<PlannerWizard navigate={vi.fn()} />);
  await generatePreview();
  first.unmount();

  render(<PlannerWizard navigate={vi.fn()} />);
  expect(await screen.findByRole("region", { name: "行程预览" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("苏州、杭州");
  expect(localStorage.getItem(PLANNER_PREVIEW_KEY)).toBeNull();
});

test("带新建参数进入时丢弃旧预览并优先使用参数", async () => {
  writePlannerPreview(oldPreview());
  window.history.replaceState(null, "", "/plan/new?destination=%E6%88%90%E9%83%BD&days=2");
  render(<PlannerWizard />);

  expect(await screen.findByRole("textbox", { name: "目的城市" })).toHaveValue("成都");
  expect(screen.getByRole("spinbutton", { name: "旅行天数" })).toHaveValue(2);
  expect(screen.queryByRole("region", { name: "行程预览" })).not.toBeInTheDocument();
  expect(localStorage.getItem(PLANNER_PREVIEW_KEY)).toBeNull();
});

test("损坏预览不会覆盖可恢复草稿", async () => {
  localStorage.setItem(PLANNER_PREVIEW_KEY, "{broken");
  writePlannerDraft(savedDraft);
  render(<PlannerWizard />);

  expect(await screen.findByRole("heading", { name: "这趟旅行想怎么玩？" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /^每人预算/ })).toHaveValue(3000);
  expect(screen.getByRole("status")).toHaveTextContent("预览无法恢复");
});

test("目的地输入去空去重后再生成", async () => {
  render(<PlannerWizard navigate={vi.fn()} />);
  await userEvent.clear(screen.getByRole("textbox", { name: "目的城市" }));
  await userEvent.type(screen.getByRole("textbox", { name: "目的城市" }), " 苏州、、杭州，苏州 ");
  await generatePreview();

  const preview = screen.getByRole("region", { name: "行程预览" });
  expect(within(preview).getByText("南京 → 苏州 → 杭州 → 南京")).toBeInTheDocument();
});

test("预览缓存写入失败时仍保留本次内存预览", async () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === PLANNER_PREVIEW_KEY) throw new Error("quota");
    return original.call(this, key, value);
  });
  render(<PlannerWizard navigate={vi.fn()} />);

  await generatePreview();
  expect(screen.getByRole("region", { name: "行程预览" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("刷新后可能无法恢复");
});
