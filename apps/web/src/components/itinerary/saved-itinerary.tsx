"use client";

import { useEffect, useState } from "react";

import { DEMO_ITINERARY } from "@/lib/demo-itinerary";
import { readSelectedTrip } from "@/lib/travel-store";
import { saveTrip } from "@/lib/travel-store";
import type { Itinerary } from "@/lib/types";
import { ItineraryView } from "./itinerary-view";

export function SavedItinerary() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => {
    try { const trip = readSelectedTrip(); setSaved(Boolean(trip)); setItinerary(trip ?? DEMO_ITINERARY); setError(""); }
    catch { setError("无法读取已保存的行程。现有数据未清除，请检查存储权限或数据后重试。"); }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <main id="main-content" className="trip-page"><p className="form-error" role="alert">{error}</p><button className="button button--ghost" onClick={load}>重新读取行程</button></main>;
  if (!itinerary) return <main id="main-content" className="trip-page" aria-busy="true"><p role="status">正在读取行程…</p></main>;
  return <ItineraryView itinerary={itinerary} initiallySaved={saved} onSave={saveTrip} />;
}
