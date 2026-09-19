import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import { SavedItinerary } from "./saved-itinerary";
beforeEach(() => localStorage.clear());

test("优先展示本地保存的最近一次行程", async () => {
  localStorage.setItem(
    "travel:last-itinerary",
    JSON.stringify({
      ...DEMO_ITINERARY,
      title: "我的江南慢旅行",
    }),
  );

  render(<SavedItinerary />);

  expect(
    await screen.findByRole("heading", { name: "我的江南慢旅行" }),
  ).toBeInTheDocument();
});

test("本地数据损坏时仍能展示示例行程", async () => {
  localStorage.setItem("travel:last-itinerary", "not-json");

  render(<SavedItinerary />);

  expect(
    await screen.findByRole("heading", { name: DEMO_ITINERARY.title }),
  ).toBeInTheDocument();
});

test("新版数据无法读取时保留数据，修正后可重试且不冒充演示", async () => {
  localStorage.setItem("travel:library:v2", "not-json");
  render(<SavedItinerary />);
  expect(await screen.findByRole("alert")).toHaveTextContent("无法读取");
  expect(localStorage.getItem("travel:library:v2")).toBe("not-json");
  expect(screen.queryByRole("heading", { name: DEMO_ITINERARY.title })).not.toBeInTheDocument();
  localStorage.setItem("travel:library:v2", JSON.stringify({ version: 2, trips: [{ ...DEMO_ITINERARY, title: "找回旅行" }], trash: [], selectedId: null }));
  await userEvent.click(screen.getByRole("button", { name: "重新读取行程" }));
  expect(await screen.findByRole("heading", { name: "找回旅行" })).toBeInTheDocument();
});

test("未保存的示例不会冒充已保存行程", async () => {
  render(<SavedItinerary />);
  expect(await screen.findByLabelText("保存状态")).toHaveTextContent("未保存");
});
