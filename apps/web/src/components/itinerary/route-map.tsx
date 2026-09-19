"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { ItineraryItem } from "@/lib/types";
import { fetchMapStatus, isLocated, requestRoute, type MapRoute, type MapStatus, type TravelMode } from "@/lib/maps";
import { MapCanvas } from "./map-canvas";

export function RouteMap({ items, activeIndex, onSelect }: { items: ItineraryItem[]; activeIndex: number; onSelect: (index: number) => void }) {
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [serviceMessage, setServiceMessage] = useState("正在检查地图服务…");
  const [mode, setMode] = useState<TravelMode>("walking");
  const [leg, setLeg] = useState("");
  const [result, setResult] = useState<MapRoute | null>(null);
  const [routeMessage, setRouteMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const routeController = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const legs = items.flatMap((item, index) => index > 0 && isLocated(items[index - 1]) && isLocated(item) ? [{ index, from: items[index - 1], to: item }] : []);
  const selectedLeg = legs.find(value => String(value.index) === leg) ?? legs[0];
  const located = items.filter(isLocated).length;

  useEffect(() => {
    const controller = new AbortController();
    setServiceMessage("正在检查地图服务…");
    fetchMapStatus(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setStatus(value);
      setServiceMessage(value.map_available ? "" : "真实地图未配置，行程编辑和保存不受影响。");
    }).catch(error => { if (!controller.signal.aborted) { setStatus(null); setServiceMessage(error.message); } });
    return () => controller.abort();
  }, [attempt]);

  const invalidate = () => {
    revision.current++; routeController.current?.abort(); setResult(null); setRouteMessage(""); setLoading(false);
  };
  useEffect(() => { invalidate(); setLeg(""); return () => { revision.current++; routeController.current?.abort(); }; }, [items]);

  const calculate = async () => {
    if (!selectedLeg) return;
    invalidate();
    const controller = new AbortController();
    routeController.current = controller;
    const current = revision.current;
    setLoading(true);
    setRouteMessage("正在计算路线…");
    try {
      const route = await requestRoute(selectedLeg.from, selectedLeg.to, mode, controller.signal);
      if (current !== revision.current || controller.signal.aborted) return;
      setResult(route);
      setRouteMessage("");
    } catch (error) { if (current === revision.current && !controller.signal.aborted) setRouteMessage(error instanceof Error ? error.message : "路线计算失败。"); }
    finally { if (current === revision.current) setLoading(false); }
  };

  return <section className="real-route-map" aria-label="路线地图">
    {status?.map_available && status.js_key && located > 0
      ? <MapCanvas items={items} activeIndex={activeIndex} onSelect={onSelect} route={result} jsKey={status.js_key} />
      : status?.map_available && located === 0
        ? <div className="real-map-message real-map-message--unavailable"><MapPin size={28} /><strong>添加真实定位地点后显示地图</strong><p>手动输入的名称不会使用默认城市或演示坐标。</p></div>
        : <div className="real-map-message real-map-message--unavailable"><MapPin size={28} /><strong>{serviceMessage}</strong><p>配置高德后显示真实底图和已定位地点，不再使用演示连线。</p><button className="button button--ghost" onClick={() => setAttempt(value => value + 1)}>重新检查服务</button></div>}
    <div className="route-calculator">
      <div className="route-calculator__heading"><strong>两站之间怎么走</strong><span>{located} 个已定位 · {items.length - located} 个待定位</span></div>
      <label className="field"><span>路段</span><select aria-label="路段" disabled={!legs.length} value={selectedLeg ? String(selectedLeg.index) : ""} onChange={event => { invalidate(); setLeg(event.target.value); }}>
        {!legs.length && <option value="">请先添加连续两个已定位地点</option>}
        {legs.map(value => <option key={value.index} value={value.index}>{value.from.name} → {value.to.name}</option>)}
      </select></label>
      <div className="route-calculator__controls"><label className="field"><span>交通方式</span><select aria-label="交通方式" value={mode} onChange={event => { invalidate(); setMode(event.target.value as TravelMode); }}><option value="walking">步行</option><option value="driving">驾车</option><option value="transit">公交 / 地铁</option></select></label><button className="button button--primary" disabled={!status?.search_available || !selectedLeg || loading} onClick={calculate}>{loading ? "计算中…" : "计算路线"}</button></div>
      {result && <div className="route-calculator__result"><strong>{result.distance_meters >= 1000 ? `${(result.distance_meters / 1000).toFixed(1)} 公里` : `${result.distance_meters} 米`} · 约 {Math.ceil(result.duration_seconds / 60)} 分钟</strong><small>高德路线估算 · 非未来班次或到达时间保证{result.polyline.length < 2 ? " · 暂无可绘制线路" : ""}</small></div>}
      {routeMessage && <p className="route-calculator__status" aria-live="polite">{routeMessage}</p>}
      {status && !status.search_available && <p className="route-calculator__status">路线服务未配置，仍可编辑和保存行程。请配置高德 Web 服务 Key。</p>}
      <p className="route-calculator__note">仅计算连续的真实定位地点；改动安排后需重新计算。营业时间和票价仍需核实。</p>
    </div>
  </section>;
}
