import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import type { Itinerary } from "@/lib/types";
import { useItineraryEditor } from "./use-itinerary-editor";

function Harness({
  itinerary = DEMO_ITINERARY,
  onSave,
  blocked = false,
  initiallySaved = true,
}: {
  itinerary?: Itinerary;
  onSave?: (value: Itinerary) => void | Promise<void>;
  blocked?: boolean;
  initiallySaved?: boolean;
}) {
  const editor = useItineraryEditor({ itinerary, onSave, initiallySaved, autosaveBlocked: blocked });
  return <>
    <output aria-label="title">{editor.current.title}</output>
    <output aria-label="state">{editor.saveState}</output>
    <output aria-label="message">{editor.statusMessage}</output>
    <button onClick={() => editor.commit({ ...editor.current, title: "第一次" })}>修改一次</button>
    <button onClick={() => editor.commit({ ...editor.current, title: "最新标题" })}>再修改</button>
    <button onClick={() => editor.commit({ ...editor.current, title: `${editor.current.title}!` })}>追加</button>
    <button onClick={editor.undo} disabled={!editor.canUndo}>撤销</button>
    <button onClick={editor.saveNow}>立即保存</button>
  </>;
}

afterEach(() => vi.useRealTimers());

test("连续修改只在 600ms 后自动保存最新快照", async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  render(<Harness onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "修改一次" }));
  fireEvent.click(screen.getByRole("button", { name: "再修改" }));
  expect(screen.getByLabelText("state")).toHaveTextContent("dirty");

  await act(async () => vi.advanceTimersByTime(599));
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].title).toBe("最新标题");
  expect(screen.getByLabelText("state")).toHaveTextContent("saved");
});

test("存在未确认草稿时阻止自动保存，仍可手动保存最新内容", async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  render(<Harness onSave={save} blocked />);
  fireEvent.click(screen.getByRole("button", { name: "修改一次" }));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "立即保存" }));
  await act(async () => Promise.resolve());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: "第一次" }));
});

test("失败后保留修改，重试保存当前最新快照", async () => {
  vi.useFakeTimers();
  let fail = true;
  const save = vi.fn((value: Itinerary) => {
    if (fail) throw new Error("quota");
    expect(value.title).toBe("最新标题");
  });
  render(<Harness onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "修改一次" }));
  await act(async () => vi.advanceTimersByTime(600));
  expect(screen.getByLabelText("state")).toHaveTextContent("failed");
  fireEvent.click(screen.getByRole("button", { name: "再修改" }));
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "立即保存" }));
  await act(async () => Promise.resolve());
  expect(screen.getByLabelText("state")).toHaveTextContent("saved");
});

test("旧保存完成不会把保存期间的新修改误标为已保存", async () => {
  vi.useFakeTimers();
  let resolveFirst!: () => void;
  const save = vi.fn(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
  render(<Harness onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "修改一次" }));
  await act(async () => vi.advanceTimersByTime(600));
  expect(screen.getByLabelText("state")).toHaveTextContent("saving");
  fireEvent.click(screen.getByRole("button", { name: "再修改" }));
  await act(async () => resolveFirst());
  expect(screen.getByLabelText("state")).toHaveTextContent("dirty");
});

test("撤销栈最多保留 20 步并在切换行程时重置", () => {
  const { rerender } = render(<Harness />);
  for (let index = 0; index < 21; index++) fireEvent.click(screen.getByRole("button", { name: "追加" }));
  for (let index = 0; index < 20; index++) fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByLabelText("title")).toHaveTextContent(`${DEMO_ITINERARY.title}!`);
  expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();

  rerender(<Harness itinerary={{ ...DEMO_ITINERARY, id: "another", title: "新行程" }} />);
  expect(screen.getByLabelText("title")).toHaveTextContent("新行程");
  expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
});
