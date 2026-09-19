import type { ItineraryItem } from "./types";

export interface MapPlace {
  id: string;
  name: string;
  address: string;
  citycode: string;
  coordinate: [number, number];
  category: string;
}
export type TravelMode = "walking" | "driving" | "transit";
export interface MapRoute {
  mode: TravelMode;
  distance_meters: number;
  duration_seconds: number;
  polyline: [number, number][];
}
export interface MapStatus { search_available: boolean; map_available: boolean; js_key: string | null }

export function getMapsApiBase(hostname: string, configured = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (configured?.trim()) return configured.trim().replace(/\/+$/, "");
  return hostname === "localhost" || hostname === "127.0.0.1" ? `http://${hostname}:8000` : null;
}

export function isLocated(item: Pick<ItineraryItem, "coordinate" | "location_source">) {
  const [lng, lat] = item.coordinate;
  return item.location_source === "amap" && Number.isFinite(lng) && Number.isFinite(lat)
    && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 && (lng !== 0 || lat !== 0);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getMapsApiBase(window.location.hostname);
  if (!base) throw new Error("地图后端未配置，仍可手动编辑行程。");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "地图请求失败，请检查输入或重试。");
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("地图请求已取消或超时，请重试。");
    if (error instanceof TypeError) throw new Error("地图后端暂未连接，仍可手动编辑行程。");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function fetchMapStatus(signal?: AbortSignal) {
  return request<MapStatus>("/api/maps/status", { signal });
}
export async function searchPlaces(query: string, city: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ query: query.trim(), city: city.trim() });
  return (await request<{ places: MapPlace[] }>(`/api/maps/places?${params}`, { signal })).places;
}
export function requestRoute(origin: Pick<ItineraryItem, "coordinate" | "citycode">, destination: Pick<ItineraryItem, "coordinate" | "citycode">, mode: TravelMode, signal?: AbortSignal) {
  return request<MapRoute>("/api/maps/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: origin.coordinate, destination: destination.coordinate, mode, citycode: origin.citycode || undefined, destination_citycode: destination.citycode || undefined }), signal });
}
