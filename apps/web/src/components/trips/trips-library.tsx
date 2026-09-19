"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck2, CalendarDays, Copy, MapPin, Pencil, RotateCcw, Trash2, Users, WalletCards } from "lucide-react";

import { deleteTrip, duplicateTrip, permanentlyDeleteTrip, readDeletedTrips, readTrips, renameTrip, restoreTrip, selectTrip, type DeletedTrip } from "@/lib/travel-store";
import type { Itinerary } from "@/lib/types";
import { CardReveal } from "@/components/card-reveal";
import { getTripReadiness } from "@/lib/itinerary-reservations";

type TripsLibraryProps = {
  navigate?: (href: string) => void;
  confirmDelete?: (title: string) => boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "日期待定";
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function TripsLibrary({
  navigate = (href) => window.location.assign(href),
  confirmDelete,
}: TripsLibraryProps) {
  const [trips, setTrips] = useState<Itinerary[]>([]);
  const [ready, setReady] = useState(false);
  const [trash, setTrash] = useState<DeletedTrip[]>([]);
  const [view, setView] = useState<"active" | "trash">("active");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Itinerary | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<{ trip: Itinerary; permanent: boolean } | null>(null);

  const refresh = () => {
    try { setTrips(readTrips()); setTrash(readDeletedTrips()); setUnavailable(false); }
    catch { setUnavailable(true); setFailed(true); setMessage("无法读取行程，请检查浏览器存储权限。现有数据未被清除。"); }
    setReady(true);
  };

  useEffect(() => {
    refresh();
    const listener = (event: StorageEvent) => {
      if (event.key !== null && !["travel:library:v2", "travel:trips:v1", "travel:last-itinerary", "travel:selected-trip-id"].includes(event.key)) return;
      setEditing(null); setPending(null); refresh();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  const openTrip = (trip: Itinerary) => {
    try { selectTrip(trip.id); navigate("/trips/demo"); }
    catch { setFailed(true); setMessage("无法打开行程，请检查浏览器存储权限后重试。"); }
  };

  const removeTrip = (trip: Itinerary) => {
    if (confirmDelete) { if (confirmDelete(trip.title)) mutate(() => deleteTrip(trip.id), "已移入回收站，可随时恢复。"); }
    else setPending({ trip, permanent: false });
  };

  const mutate = (action: () => void, success: string) => {
    try { action(); setFailed(false); setMessage(success); setPending(null); setEditing(null); refresh(); }
    catch (error) { setFailed(true); setMessage(error instanceof Error && error.message.includes("名称") ? error.message : "操作未完成，请检查浏览器存储空间或权限后重试。原有行程仍保留。"); }
  };
  const filter = query.trim().toLocaleLowerCase();
  const matches = (trip: Itinerary) => `${trip.title} ${trip.route.join(" ")}`.toLocaleLowerCase().includes(filter);
  const visibleTrips = trips.filter(matches);
  const visibleTrash = trash.filter(entry => matches(entry.trip));

  if (!ready) return <main id="main-content" className="trips-page" aria-busy="true"><p role="status">正在读取保存的行程…</p></main>;

  return (
    <main id="main-content" className="trips-page">
      <section className="trips-heading">
        <div>
          <h1>我的行程</h1>
          <p>保存在当前浏览器中的旅行计划</p>
        </div>
        <Link className="button button--primary" href="/plan/new">新建行程<ArrowRight size={16} /></Link>
      </section>

      <div className="library-toolbar">
        <div className="segmented" aria-label="行程分类"><button aria-pressed={view === "active"} onClick={() => { setView("active"); setEditing(null); setPending(null); }}>全部行程（{trips.length}）</button><button aria-pressed={view === "trash"} onClick={() => { setView("trash"); setEditing(null); setPending(null); }}>回收站（{trash.length}）</button></div>
        <label className="field"><span className="sr-only">搜索行程</span><input type="search" aria-label="搜索行程" placeholder="搜索名称或城市" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      {message && <p className={failed ? "form-error" : "trip-status"} role={failed ? "alert" : "status"}>{message}</p>}
      {unavailable ? <button className="button button--ghost" onClick={refresh}>重新读取行程</button> : <>
      {editing && <form className="library-action-panel" aria-label="重命名行程" onSubmit={event => { event.preventDefault(); mutate(() => renameTrip(editing.id, name), "行程名称已更新。"); }}><label className="field"><span>行程名称</span><input aria-label="行程名称" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><div className="library-actions"><button type="submit" className="button button--primary">保存名称</button><button type="button" className="button button--ghost" onClick={() => setEditing(null)}>取消</button></div></form>}
      {pending && <section className="library-action-panel" aria-label="删除确认"><strong>{pending.permanent ? "永久删除后无法恢复" : "移入回收站后，可以随时恢复"}</strong><p>“{pending.trip.title}”{pending.permanent ? "将从当前浏览器永久移除。" : "不会立即永久删除。"}</p><div className="library-actions"><button className="button button--primary" onClick={() => mutate(() => pending.permanent ? permanentlyDeleteTrip(pending.trip.id) : deleteTrip(pending.trip.id), pending.permanent ? "已永久删除该行程，无法恢复。" : "已移入回收站，可随时恢复。")}>{pending.permanent ? "确认永久删除" : "确认移入回收站"}</button><button className="button button--ghost" onClick={() => setPending(null)}>取消</button></div></section>}
      {view === "trash" ? <>
        <p className="library-note">回收站不会自动清理；恢复后可继续编辑。永久删除无法撤销。</p>
        {visibleTrash.length ? <section className="trips-list" aria-label="回收站行程">{visibleTrash.map(({ trip, deletedAt }) => <CardReveal key={trip.id}><article className="trip-list-item"><div className="trip-list-item__open"><span className="trip-list-item__route">{trip.route.join(" → ")}</span><h2>{trip.title}</h2><p className="library-note">移入时间：{new Date(deletedAt).toLocaleDateString("zh-CN")}</p></div><div className="library-actions"><button className="button button--ghost" aria-label={`恢复${trip.title}`} onClick={() => mutate(() => restoreTrip(trip.id), "已恢复行程，请在全部行程中继续编辑。")}><RotateCcw size={16} />恢复</button><button className="button button--ghost library-danger" aria-label={`永久删除${trip.title}`} onClick={() => setPending({ trip, permanent: true })}><Trash2 size={16} />永久删除</button></div></article></CardReveal>)}</section> : <section className="trips-empty"><h2>{filter ? "没有匹配的行程" : "回收站是空的"}</h2></section>}
      </> : <>

      {visibleTrips.length === 0 ? (
        <section className="trips-empty">
          <span><MapPin size={24} /></span>
          <h2>{filter ? "没有匹配的行程" : "还没有保存的旅行"}</h2>
          <p>{filter ? "试试其他名称或城市。" : "完成一次规划后，行程会自动保存在这里。"}</p>
          {filter ? <button className="button button--ghost" onClick={() => setQuery("")}>清除搜索</button> : <Link className="button button--primary" href="/plan/new">创建第一份行程</Link>}
        </section>
      ) : (
        <section className="trips-list" aria-label="已保存行程">
          {visibleTrips.map((trip) => {
            const readiness = getTripReadiness(trip);
            const readinessLabel = readiness.planned > 0 ? `${readiness.planned} 项待确认` : readiness.confirmed > 0 ? "交通住宿已确认" : "交通住宿待补充";
            return (
            <CardReveal key={trip.id}><article className="trip-list-item">
              <button className="trip-list-item__open" aria-label={`打开${trip.title}`} onClick={() => openTrip(trip)}>
                <span className="trip-list-item__route">{trip.route.join(" → ")}</span>
                <h2>{trip.title}</h2>
                <div className="trip-list-item__meta">
                  <span><CalendarDays size={15} />{formatDate(trip.days[0]?.date)} · {trip.days.length} 天</span>
                  <span><Users size={15} />{trip.travelers} 人</span>
                  <span><WalletCards size={15} />预算 ¥{trip.budget.total_available.toLocaleString("zh-CN")}</span>
                  <span><CalendarCheck2 size={15} />{readinessLabel}</span>
                </div>
              </button>
              <div className="library-actions"><button className="button button--ghost" aria-label={`重命名${trip.title}`} onClick={() => { setEditing(trip); setName(trip.title); setPending(null); }}><Pencil size={15} />重命名</button><button className="button button--ghost" aria-label={`复制${trip.title}`} onClick={() => mutate(() => { duplicateTrip(trip.id); }, "已创建独立副本，原行程未改动。")}><Copy size={15} />复制</button><button className="button button--ghost library-danger" aria-label={`删除${trip.title}`} onClick={() => removeTrip(trip)}><Trash2 size={17} />删除</button></div>
            </article></CardReveal>
          );})}
        </section>
      )}
      </>}
      </>}
    </main>
  );
}
