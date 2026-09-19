"use client";

import { type FormEvent, useState } from "react";

import { validateReservation } from "@/lib/itinerary-reservations";
import { reservationCostScope } from "@/lib/itinerary-budget";
import type { TravelReservation } from "@/lib/types";

type ReservationEditorProps = {
  value: TravelReservation;
  onChange: (value: TravelReservation) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const statusOptions = [
  ["planned", "待确认"], ["confirmed", "已确认"], ["cancelled", "已取消"],
] as const;
const transportOptions = [
  ["flight", "飞机"], ["train", "火车"], ["coach", "长途汽车"],
  ["ferry", "轮渡"], ["drive", "自驾"], ["other", "其他"],
] as const;
const stayOptions = [
  ["hotel", "酒店"], ["homestay", "民宿"], ["hostel", "青年旅舍"],
  ["friends", "亲友家"], ["other", "其他"],
] as const;

export function ReservationEditor({ value, onChange, onSubmit, onCancel }: ReservationEditorProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (patch: Partial<TravelReservation>) => onChange({ ...value, ...patch } as TravelReservation);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateReservation(value);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      const target = event.currentTarget.elements.namedItem(first);
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    onSubmit();
  };

  const error = (name: string) => errors[name]
    ? <small id={`reservation-error-${name}`} className="field-error">{errors[name]}</small>
    : null;
  const describedBy = (name: string) => errors[name] ? `reservation-error-${name}` : undefined;

  return (
    <form className="reservation-editor" aria-label={value.kind === "transport" ? "编辑交通" : "编辑住宿"} onSubmit={submit}>
      <div className="reservation-editor__heading">
        <div><small>{value.kind === "transport" ? "TRANSPORT" : "STAY"}</small><h3>{value.kind === "transport" ? "交通信息" : "住宿信息"}</h3></div>
        <button className="button button--ghost" type="button" onClick={onCancel}>取消编辑</button>
      </div>
      {Object.keys(errors).length > 0 && <p className="form-error" role="alert">请检查表单：{Object.values(errors)[0]}</p>}
      <div className="reservation-form-grid">
        <label className="field field--wide"><span>{value.kind === "transport" ? "交通名称" : "住宿名称"}</span><input name="title" maxLength={80} aria-describedby={describedBy("title")} value={value.title} onChange={event => update({ title: event.target.value })} />{error("title")}</label>
        {value.kind === "transport" ? (
          <label className="field"><span>交通方式</span><select name="mode" value={value.mode} onChange={event => update({ mode: event.target.value as typeof value.mode })}>{transportOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        ) : (
          <label className="field"><span>住宿类型</span><select name="stay_type" value={value.stay_type} onChange={event => update({ stay_type: event.target.value as typeof value.stay_type })}>{stayOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        )}
        <label className="field"><span>状态</span><select name="status" value={value.status} onChange={event => update({ status: event.target.value as typeof value.status })}>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

        {value.kind === "transport" ? <>
          <label className="field"><span>出发地点</span><input name="departure_place" maxLength={120} aria-describedby={describedBy("departure_place")} value={value.departure_place} onChange={event => update({ departure_place: event.target.value })} />{error("departure_place")}</label>
          <label className="field"><span>到达地点</span><input name="arrival_place" maxLength={120} aria-describedby={describedBy("arrival_place")} value={value.arrival_place} onChange={event => update({ arrival_place: event.target.value })} />{error("arrival_place")}</label>
          <label className="field"><span>出发时间</span><input name="departure_at" type="datetime-local" aria-describedby={describedBy("departure_at")} value={value.departure_at} onChange={event => update({ departure_at: event.target.value })} />{error("departure_at")}</label>
          <label className="field"><span>到达时间</span><input aria-label="到达时间" name="arrival_at" type="datetime-local" aria-describedby={describedBy("arrival_at")} value={value.arrival_at} onChange={event => update({ arrival_at: event.target.value })} />{error("arrival_at")}</label>
          <label className="field"><span>承运方</span><input name="provider" maxLength={80} value={value.provider ?? ""} onChange={event => update({ provider: event.target.value })} /></label>
          <label className="field"><span>班次</span><input name="service_number" maxLength={80} value={value.service_number ?? ""} onChange={event => update({ service_number: event.target.value })} /></label>
        </> : <>
          <label className="field"><span>入住日期</span><input name="check_in_date" type="date" aria-describedby={describedBy("check_in_date")} value={value.check_in_date} onChange={event => update({ check_in_date: event.target.value })} />{error("check_in_date")}</label>
          <label className="field"><span>退房日期</span><input name="check_out_date" type="date" aria-describedby={describedBy("check_out_date")} value={value.check_out_date} onChange={event => update({ check_out_date: event.target.value })} />{error("check_out_date")}</label>
          <label className="field field--wide"><span>地址</span><input name="address" maxLength={160} value={value.address ?? ""} onChange={event => update({ address: event.target.value })} /></label>
          <label className="field"><span>联系电话</span><input name="contact" maxLength={80} value={value.contact ?? ""} onChange={event => update({ contact: event.target.value })} /></label>
        </>}

        <label className="field"><span>预订编号</span><input name="confirmation_number" maxLength={80} value={value.confirmation_number ?? ""} onChange={event => update({ confirmation_number: event.target.value })} /></label>
        <label className="field"><span>费用</span><input name="cost" type="number" min="0" step="0.01" inputMode="decimal" aria-describedby={describedBy("cost")} value={value.cost ?? ""} onChange={event => update({ cost: event.target.value === "" ? undefined : Number(event.target.value) })} />{error("cost")}</label>
        <label className="field"><span>费用口径</span><select name="cost_scope" value={reservationCostScope(value)} onChange={event => update({ cost_scope: event.target.value as TravelReservation["cost_scope"] })}><option value="per_person">每人费用</option><option value="total">整单费用</option></select></label>
        <label className="field field--wide"><span>备注</span><textarea name="notes" maxLength={500} rows={3} aria-describedby={describedBy("notes")} value={value.notes ?? ""} onChange={event => update({ notes: event.target.value })} />{error("notes")}</label>
      </div>
      <p className="reservation-privacy">时间按当地时间填写；请勿填写证件号码或支付信息。</p>
      <div className="reservation-editor__actions"><button className="button button--primary" type="submit">{value.kind === "transport" ? "保存交通" : "保存住宿"}</button><button className="button button--ghost" type="button" onClick={onCancel}>取消</button></div>
    </form>
  );
}
