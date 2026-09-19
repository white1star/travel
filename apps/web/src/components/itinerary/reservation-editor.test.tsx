import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import type { StayReservation, TransportReservation, TravelReservation } from "@/lib/types";
import { ReservationEditor } from "./reservation-editor";

const train: TransportReservation = { id: "train-1", kind: "transport", mode: "train", status: "confirmed", title: "南京到苏州", departure_at: "2026-10-02T08:00", arrival_at: "2026-10-02T09:35", departure_place: "南京南站", arrival_place: "苏州站", cost: 180 };
const stay: StayReservation = { id: "stay-1", kind: "stay", stay_type: "hotel", status: "planned", title: "苏州酒店", check_in_date: "2026-10-02", check_out_date: "2026-10-04" };

test("交通表单阻止倒序时间并将错误焦点放到到达时间", async () => {
  const commit = vi.fn();
  function Harness() {
    const [value, setValue] = useState<TravelReservation>(train);
    return <ReservationEditor value={value} onChange={setValue} onSubmit={commit} onCancel={() => undefined} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("到达时间"), { target: { value: "2026-10-02T07:00" } });
  await userEvent.click(screen.getByRole("button", { name: "保存交通" }));
  expect(screen.getByRole("alert")).toHaveTextContent("晚于出发时间");
  expect(screen.getByLabelText("到达时间")).toHaveFocus();
  expect(commit).not.toHaveBeenCalled();
});

test("费用留空和明确填写零元保持不同数据", () => {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<TravelReservation>({ ...stay, cost: undefined });
    return <ReservationEditor value={value} onChange={next => { setValue(next); onChange(next); }} onSubmit={() => undefined} onCancel={() => undefined} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("费用"), { target: { value: "0" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 0 }));
  fireEvent.change(screen.getByLabelText("费用"), { target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cost: undefined }));
});

test("可以在每人费用和整单费用之间切换", async () => {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<TravelReservation>(train);
    return <ReservationEditor value={value} onChange={next => { setValue(next); onChange(next); }} onSubmit={() => undefined} onCancel={() => undefined} />;
  }
  render(<Harness />);

  expect(screen.getByRole("combobox", { name: "费用口径" })).toHaveValue("per_person");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "费用口径" }), "total");
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cost_scope: "total" }));
});
