import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import HomePage from "./page";

test("首页提供开始规划入口", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "开始规划" })).toBeInTheDocument();
});

test("首页用通用规划结果代替具体城市案例", () => {
  render(<HomePage />);

  expect(screen.queryByText(/苏州|苏杭/)).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "规划结果预览" })).toBeInTheDocument();
  expect(screen.getByText("逐日安排")).toBeInTheDocument();
  expect(screen.getByText("路线优化")).toBeInTheDocument();
  expect(screen.getByText("预算分配")).toBeInTheDocument();
});

test("首页两张入口卡片连接真实创建页和行程库", () => {
  render(<HomePage />);
  const entries = screen.getByRole("navigation", { name: "旅行入口" });
  expect(within(entries).getByRole("link", { name: /规划一次旅行/ })).toHaveAttribute("href", "/plan/new");
  expect(within(entries).getByRole("link", { name: /查看我的行程/ })).toHaveAttribute("href", "/trips");
  expect(screen.queryByRole("link", { name: /登录|个人中心/ })).not.toBeInTheDocument();
});

test("首页快速规划表单将用户输入提交到创建页", () => {
  render(<HomePage />);
  const form = screen.getByRole("form", { name: "快速规划" });
  expect(form).toHaveAttribute("action", "/plan/new");
  expect(form).toHaveAttribute("method", "get");
  expect(within(form).getByRole("textbox", { name: "目的地" })).toHaveAttribute("name", "destination");
  expect(within(form).getByRole("spinbutton", { name: "行程天数" })).toHaveAttribute("name", "days");
  expect(within(form).getByRole("combobox", { name: "旅行节奏" })).toHaveAttribute("name", "pace");
  expect(within(form).getByRole("button", { name: "继续规划" })).toHaveAttribute("type", "submit");
});
