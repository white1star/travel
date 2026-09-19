"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { ItineraryItem } from "@/lib/types";
import { getMapsApiBase, isLocated, type MapRoute } from "@/lib/maps";
import { loadAMap, type AMapInstance, type AMapSDK } from "@/lib/amap-sdk";

export function MapCanvas({ items, activeIndex, onSelect, route, jsKey }: {
  items: ItineraryItem[]; activeIndex: number; onSelect: (index: number) => void; route: MapRoute | null; jsKey: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<AMapInstance | null>(null);
  const sdk = useRef<AMapSDK | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setError("");
    const base = getMapsApiBase(window.location.hostname);
    loadAMap(jsKey, `${base}/_AMapService`).then(api => {
      if (disposed || !container.current) return;
      sdk.current = api;
      const firstLocated = items.find(isLocated);
      const map = new api.Map(container.current, { zoom: 12, ...(firstLocated ? { center: firstLocated.coordinate } : {}), viewMode: "2D" });
      instance.current = map;
      timer = setTimeout(() => { if (!disposed) setError("地图底图未能加载，请检查网络和授权后重试。"); }, 12000);
      map.on("complete", () => { if (!disposed) { clearTimeout(timer); setError(""); setReady(true); } });
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "地图加载失败。"); });
    return () => { disposed = true; clearTimeout(timer); instance.current?.destroy(); instance.current = null; sdk.current = null; };
  }, [jsKey, attempt]);

  useEffect(() => {
    const map = instance.current, api = sdk.current;
    if (!ready || !map || !api) return;
    const overlays: unknown[] = [];
    items.forEach((item, index) => {
      if (!isLocated(item)) return;
      const content = document.createElement("button");
      content.type = "button";
      content.className = `real-map-marker${index === activeIndex ? " is-active" : ""}`;
      content.textContent = String(index + 1);
      content.setAttribute("aria-label", `地图选择${item.name}`);
      content.onclick = () => onSelect(index);
      overlays.push(new api.Marker({ position: item.coordinate, content, anchor: "center" }));
    });
    if (route && route.polyline.length >= 2) overlays.push(new api.Polyline({ path: route.polyline, strokeColor: "#24836d", strokeWeight: 5, strokeOpacity: .85 }));
    map.add(overlays);
    if (overlays.length) map.setFitView(overlays);
    return () => map.remove(overlays);
  }, [items, activeIndex, onSelect, route, ready]);

  return <div className="real-map-frame">
    <div ref={container} className="real-map-canvas" aria-label="高德地图" />
    {!ready && <div className="real-map-message" aria-live="polite"><MapPin size={26} /><strong>{error || "正在加载高德地图…"}</strong>{error && <button className="button button--ghost" onClick={() => setAttempt(value => value + 1)}>重试地图</button>}</div>}
  </div>;
}
