"use client";

import { BedDouble, CalendarCheck2, CircleAlert, Pencil, Plus, TrainFront, Trash2, WalletCards } from "lucide-react";
import { useState } from "react";

import { findReservationIssues, getTripReadiness, sortReservations } from "@/lib/itinerary-reservations";
import { reservationCostScope } from "@/lib/itinerary-budget";
import type { Itinerary, StayReservation, TransportReservation, TravelReservation } from "@/lib/types";
import { ReservationEditor } from "./reservation-editor";

type TravelLogisticsProps = {
  itinerary: Itinerary;
  draft: TravelReservation | null;
  onDraftChange: (value: TravelReservation | null) => void;
  onCommit: (value: TravelReservation) => void;
  onDelete: (id: string) => void;
};

const statusLabel = { planned: "待确认", confirmed: "已确认", cancelled: "已取消" } as const;
const transportLabel = { flight: "飞机", train: "火车", coach: "长途汽车", ferry: "轮渡", drive: "自驾", other: "其他" } as const;
const stayLabel = { hotel: "酒店", homestay: "民宿", hostel: "青年旅舍", friends: "亲友家", other: "其他" } as const;

function newTransport(): TransportReservation {
  return { id: crypto.randomUUID(), kind: "transport", mode: "train", status: "planned", title: "", departure_at: "", arrival_at: "", departure_place: "", arrival_place: "", cost_scope: "per_person" };
}

function newStay(): StayReservation {
  return { id: crypto.randomUUID(), kind: "stay", stay_type: "hotel", status: "planned", title: "", check_in_date: "", check_out_date: "", cost_scope: "total" };
}

function dateLabel(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function dateTimeLabel(value: string): string {
  return `${dateLabel(value.slice(0, 10))} ${value.slice(11)}`;
}

export function TravelLogistics({ itinerary, draft, onDraftChange, onCommit, onDelete }: TravelLogisticsProps) {
  const [pendingDelete, setPendingDelete] = useState<TravelReservation | null>(null);
  const readiness = getTripReadiness(itinerary);
  const issues = findReservationIssues(itinerary);
  const reservations = sortReservations(itinerary.reservations ?? []);
  const transports = reservations.filter((value): value is TransportReservation => value.kind === "transport");
  const stays = reservations.filter((value): value is StayReservation => value.kind === "stay");

  const edit = (value: TravelReservation) => {
    setPendingDelete(null);
    onDraftChange(structuredClone(value));
  };

  return (
    <section className="travel-logistics" aria-label="交通住宿中心">
      <div className="logistics-heading">
        <div><span>TRIP LOGISTICS</span><h2>交通与住宿</h2><p>把关键预订集中到一处，出发前更容易发现缺口。</p></div>
        <div className="logistics-actions"><button className="button button--ghost" onClick={() => onDraftChange(newTransport())}><Plus size={16} />添加交通</button><button className="button button--primary" onClick={() => onDraftChange(newStay())}><Plus size={16} />添加住宿</button></div>
      </div>

      <div className="logistics-summary" aria-label="行程准备度">
        <div><CalendarCheck2 size={18} /><span>确认情况</span><strong>已确认 {readiness.confirmed}</strong><small>待确认 {readiness.planned}</small></div>
        <div><BedDouble size={18} /><span>住宿准备</span><strong>{readiness.totalNights > 0 ? `住宿覆盖 ${readiness.coveredNights} / ${readiness.totalNights} 晚` : "日期确定后可检查住宿覆盖"}</strong><small>已取消的住宿不计入覆盖</small></div>
        <div><WalletCards size={18} /><span>整团已录入预订费用</span><strong>¥{readiness.recordedCost.toLocaleString("zh-CN")}</strong><small>预算页会用有效预订费用替代对应估算</small></div>
      </div>

      {issues.length > 0 && <div className="logistics-alerts" role="status"><div><CircleAlert size={18} /><strong>出发前需要确认</strong></div><ul>{issues.map((issue, index) => <li key={`${issue.code}-${issue.reservationId ?? issue.date}-${index}`}>{issue.code === "missing-stay" && issue.date ? `${dateLabel(issue.date)}晚尚未安排住宿` : issue.message}</li>)}</ul></div>}

      {draft && <ReservationEditor value={draft} onChange={onDraftChange} onSubmit={() => onCommit(draft)} onCancel={() => onDraftChange(null)} />}

      {pendingDelete && <section className="reservation-delete-confirm" aria-label="删除预订确认"><strong>删除“{pendingDelete.title}”？</strong><p>删除后可在保存前撤销；保存行程后本次删除才会写入本地。</p><div><button className="button button--primary" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}>确认删除</button><button className="button button--ghost" onClick={() => setPendingDelete(null)}>取消删除</button></div></section>}

      <div className="logistics-columns">
        <ReservationGroup title="交通" icon={<TrainFront size={18} />} empty="还没有交通记录" values={transports} onEdit={edit} onDelete={setPendingDelete} />
        <ReservationGroup title="住宿" icon={<BedDouble size={18} />} empty="还没有住宿记录" values={stays} onEdit={edit} onDelete={setPendingDelete} />
      </div>
    </section>
  );
}

function ReservationGroup({ title, icon, empty, values, onEdit, onDelete }: { title: string; icon: React.ReactNode; empty: string; values: TravelReservation[]; onEdit: (value: TravelReservation) => void; onDelete: (value: TravelReservation) => void }) {
  return <section className="reservation-group"><div className="reservation-group__heading"><span>{icon}{title}</span><small>{values.length} 项</small></div>{values.length === 0 ? <p className="reservation-empty">{empty}</p> : <div className="reservation-list">{values.map(value => <ReservationCard key={value.id} value={value} onEdit={() => onEdit(value)} onDelete={() => onDelete(value)} />)}</div>}</section>;
}

function ReservationCard({ value, onEdit, onDelete }: { value: TravelReservation; onEdit: () => void; onDelete: () => void }) {
  const timing = value.kind === "transport"
    ? `${dateTimeLabel(value.departure_at)} → ${dateTimeLabel(value.arrival_at)}`
    : `${dateLabel(value.check_in_date)}入住 → ${dateLabel(value.check_out_date)}退房`;
  const route = value.kind === "transport" ? `${value.departure_place} → ${value.arrival_place}` : value.address;
  const category = value.kind === "transport" ? transportLabel[value.mode] : stayLabel[value.stay_type];
  const costLabel = value.cost === undefined
    ? null
    : reservationCostScope(value) === "per_person"
      ? `¥${value.cost.toLocaleString("zh-CN")}/人`
      : `整单 ¥${value.cost.toLocaleString("zh-CN")}`;
  return <article className={`reservation-card${value.status === "cancelled" ? " is-cancelled" : ""}`}>
    <div className="reservation-card__top"><span>{category}</span><span className={`reservation-status is-${value.status}`}>{statusLabel[value.status]}</span></div>
    <h3>{value.title}</h3><p>{timing}</p>{route && <p>{route}</p>}
    <div className="reservation-card__meta">{value.provider && <span>{value.provider}</span>}{value.kind === "transport" && value.service_number && <span>{value.service_number}</span>}{costLabel && <span>{costLabel}</span>}</div>
    <div className="reservation-card__actions"><button className="button button--ghost" aria-label={`编辑${value.title}`} onClick={onEdit}><Pencil size={14} />编辑</button><button className="button button--ghost library-danger" aria-label={`删除${value.title}`} onClick={onDelete}><Trash2 size={14} />删除</button></div>
  </article>;
}
