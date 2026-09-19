export interface AMapInstance {
  add(overlays: unknown[]): void;
  remove(overlays: unknown[]): void;
  setFitView(overlays?: unknown[]): void;
  on(event: string, callback: () => void): void;
  destroy(): void;
}
export interface AMapSDK {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapInstance;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
}
declare global {
  interface Window {
    AMap?: AMapSDK;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}
let pending: Promise<AMapSDK> | undefined;

// Fetch the SDK only when map credentials are configured. Security code stays server-side.
export function loadAMap(key: string, serviceHost: string): Promise<AMapSDK> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (pending) return pending;
  window._AMapSecurityConfig = { serviceHost };
  pending = new Promise<AMapSDK>((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error || !window.AMap) {
        script.remove();
        reject(error ?? new Error("高德地图 SDK 加载失败。"));
      } else resolve(window.AMap);
    };
    const timer = setTimeout(() => finish(new Error("地图加载超时，请检查网络后重试。")), 12000);
    script.src = `https://webapi.amap.com/maps?${new URLSearchParams({ v: "2.0", key })}`;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error("地图加载失败，请检查网络、Key 和域名授权。"));
    document.head.appendChild(script);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
