"use client";

import { useEffect, useRef, useState } from "react";
import type { ItineraryItem } from "@/lib/types";
import { fetchMapStatus, searchPlaces, type MapPlace } from "@/lib/maps";

export function PlaceEditor({ original, city = "", onCommit, onCancel }: {
  original?: ItineraryItem;
  city?: string;
  onCommit: (item: ItineraryItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [time, setTime] = useState(original?.time ?? "12:00");
  const [duration, setDuration] = useState(original?.duration_minutes ?? 60);
  const [cost, setCost] = useState(0);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [available, setAvailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("正在检查地点服务…");
  const searchController = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchMapStatus(controller.signal).then(status => {
      if (controller.signal.aborted) return;
      setAvailable(status.search_available);
      setSearchStatus(status.search_available ? "搜索后选择结果即可定位。营业时间和费用仍需确认。" : "地点搜索未配置，仍可手动添加安排。");
    }).catch(error => { if (!controller.signal.aborted) setSearchStatus(error.message); });
    return () => { controller.abort(); searchController.current?.abort(); revision.current++; };
  }, []);

  const search = async () => {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const current = ++revision.current;
    setSearching(true);
    setPlaces([]);
    setSearchStatus("正在搜索地点…");
    try {
      const results = await searchPlaces(query, city, controller.signal);
      if (current !== revision.current || controller.signal.aborted) return;
      setPlaces(results);
      setSearchStatus(results.length ? `找到 ${results.length} 个地点，请选择具体地址。` : "该城市没有匹配地点，请换个关键词或手动添加。");
    } catch (error) {
      if (current === revision.current && !controller.signal.aborted) setSearchStatus(error instanceof Error ? error.message : "地点搜索失败，请重试。");
    } finally { if (current === revision.current) setSearching(false); }
  };

  return <form className="place-editor" aria-label={original ? "替换地点" : "添加地点"} onSubmit={event => {
    event.preventDefault();
    const [hours, minutes] = time.split(":").map(Number);
    const end = hours * 60 + minutes + duration;
    if (!name.trim() || !Number.isInteger(duration) || duration < 1 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(end) || end >= 1440) {
      setError("请填写地点名称和有效时间、费用；安排需在当天结束。");
      return;
    }
    onCommit({
      name: name.trim(), time, end_time: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
      duration_minutes: duration, cost, description: description.trim() || "手动添加的安排，请确认位置、开放时间和费用。",
      category: selected ? selected.category.includes("餐饮") ? "餐饮" : selected.category.includes("住宿") ? "住宿" : "景点" : "自定义安排",
      locked: false, verified_hours: false, notice: selected ? "高德定位 · 开放时间和费用需确认" : "手动添加 · 待定位",
      coordinate: selected?.coordinate ?? [0, 0],
      ...(selected ? { poi_id: selected.id, address: selected.address, citycode: selected.citycode, location_source: "amap" as const } : {}),
    });
  }}>
    <div className="editor-heading"><h2>{original ? `替换「${original.name}」` : "添加一个安排"}</h2><button type="button" className="text-button" onClick={onCancel}>取消</button></div>
    <div className="place-search">
      <label className="field"><span>搜索真实地点{city ? ` · ${city}` : ""}</span><input aria-label="搜索真实地点" value={query} maxLength={80} placeholder="搜索景点、餐厅、酒店" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (available && city && query.trim() && !searching) void search(); } }} onChange={event => {
        revision.current++; searchController.current?.abort(); setSearching(false); setPlaces([]); setQuery(event.target.value);
      }} /></label>
      <button type="button" className="button button--ghost" disabled={!available || !city || !query.trim() || searching} onClick={search}>{searching ? "搜索中…" : "搜索地点"}</button>
      <p className="place-search__status" role="status">{searchStatus}</p>
      {places.length > 0 && <ul className="place-search__results" aria-label="搜索结果">{places.map(place => <li key={place.id}><button type="button" aria-label={`选择${place.name}，${place.address}`} onClick={() => { setSelected(place); setName(place.name); setPlaces([]); setSearchStatus(`已选择：${place.name} · ${place.address}`); }}><strong>{place.name}</strong><span>{place.address || "地址信息待确认"}</span><small>高德地图 · 选择此地点</small></button></li>)}</ul>}
    </div>
    <p>{selected ? `已定位：${selected.address || selected.name}` : "也可直接手动填写安排；未选择搜索结果的地点不显示地图定位。"} 费用为每人预估，不是实时票价。</p>
    <div className="form-grid">
      <label className="field field--wide"><span>地点名称</span><input required maxLength={100} value={name} onChange={event => { setName(event.target.value); setSelected(null); }} placeholder="景点、餐厅或休息安排" /></label>
      <label className="field"><span>开始时间</span><input required type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
      <label className="field"><span>停留分钟</span><input required type="number" min={1} max={1439} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
      <label className="field"><span>每人预估费用</span><input required type="number" min={0} step="0.01" value={cost} onChange={event => setCost(Number(event.target.value))} /></label>
      <label className="field field--wide"><span>备注</span><input maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="预约提醒、想吃的菜、集合地点…" /></label>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button button--primary" type="submit">{original ? "确认替换" : "添加到当天"}</button>
  </form>;
}
