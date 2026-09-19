import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import type { BudgetAllocations } from "@/lib/types";
import { BudgetEditor } from "./budget-editor";

const initial: BudgetAllocations = {
  transport: 450,
  lodging: 690,
  food: 720,
  tickets: 120,
  local_transport: 160,
  other: 0,
};

function Harness({ onSubmit = () => undefined }: { onSubmit?: () => void }) {
  const [value, setValue] = useState(initial);
  return <BudgetEditor value={value} onChange={setValue} onSubmit={onSubmit} onCancel={() => undefined} />;
}

test("负数额度阻止确认并把焦点移到第一个错误字段", async () => {
  const onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText("交通预算（每人）"), { target: { value: "-1" } });
  await userEvent.click(screen.getByRole("button", { name: "确认分类预算" }));

  expect(screen.getByRole("alert")).toHaveTextContent("请检查分类预算");
  expect(screen.getByLabelText("交通预算（每人）")).toHaveFocus();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("零元和小数是有效的人均额度", async () => {
  const onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText("其他预算（每人）"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("门票预算（每人）"), { target: { value: "88.5" } });
  await userEvent.click(screen.getByRole("button", { name: "确认分类预算" }));

  expect(onSubmit).toHaveBeenCalledOnce();
});

test("取消按钮不提交额度", async () => {
  const submit = vi.fn();
  const cancel = vi.fn();
  render(<BudgetEditor value={initial} onChange={() => undefined} onSubmit={submit} onCancel={cancel} />);
  await userEvent.click(screen.getByRole("button", { name: "取消预算编辑" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});
