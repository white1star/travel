import type { Itinerary } from "./types";
import { isTravelReservation } from "./itinerary-reservations";
import { BUDGET_CATEGORIES, defaultBudgetAllocations, reservationCostScope } from "./itinerary-budget";
import type { BudgetAllocations } from "./types";

const TRIPS_KEY = "travel:trips:v1";
const SELECTED_KEY = "travel:selected-trip-id";
const LEGACY_KEY = "travel:last-itinerary";
const LIBRARY_KEY = "travel:library:v2";

export interface DeletedTrip { trip: Itinerary; deletedAt: string }
interface Library { version: 2; trips: Itinerary[]; trash: DeletedTrip[]; selectedId: string | null }

function isBudgetAllocations(value: unknown): value is BudgetAllocations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allocations = value as Record<string, unknown>;
  return BUDGET_CATEGORIES.every(category => typeof allocations[category] === "number"
    && Number.isFinite(allocations[category]) && allocations[category] >= 0);
}

function normalizeTrip(value: unknown): Itinerary | null {
  if (!value || typeof value !== "object") return null;
  const trip = value as Partial<Itinerary>;
  if (!trip.id || !trip.title || !Array.isArray(trip.days) || !Array.isArray(trip.route) || !trip.budget) {
    return null;
  }
  if (trip.reservations !== undefined
    && (!Array.isArray(trip.reservations) || !trip.reservations.every(isTravelReservation))) {
    return null;
  }
  if (trip.travelers !== undefined
    && (!Number.isInteger(trip.travelers) || trip.travelers <= 0)) return null;
  if (trip.budget.allocations !== undefined && !isBudgetAllocations(trip.budget.allocations)) return null;

  const normalized = {
    ...trip,
    travelers: trip.travelers ?? 2,
    reservations: (trip.reservations ?? []).map(reservation => ({
      ...reservation,
      cost_scope: reservationCostScope(reservation),
    })),
  } as Itinerary;
  return {
    ...normalized,
    budget: { ...normalized.budget, allocations: defaultBudgetAllocations(normalized) },
  };
}

function parseTrip(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeTrip(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLegacyTrips(storage: Storage): Itinerary[] {
  try {
    const parsed = JSON.parse(storage.getItem(TRIPS_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      const trips = parsed.map(normalizeTrip).filter((trip): trip is Itinerary => Boolean(trip));
      if (trips.length) return trips;
    }
  } catch {
    // Fall through to the legacy single-trip key.
  }

  const legacy = parseTrip(storage.getItem(LEGACY_KEY));
  return legacy ? [legacy] : [];
}

function readLibrary(storage: Storage): Library {
  const raw = storage.getItem(LIBRARY_KEY);
  if (raw !== null) {
    let value: Library;
    try {
      value = JSON.parse(raw) as Library;
    } catch {
      throw new Error("行程数据无法读取，请勿清除浏览器数据。");
    }
    const trips = Array.isArray(value?.trips) ? value.trips.map(normalizeTrip) : [];
    const trash = Array.isArray(value?.trash)
      ? value.trash.map(entry => entry && typeof entry.deletedAt === "string"
        ? { trip: normalizeTrip(entry.trip), deletedAt: entry.deletedAt }
        : null)
      : [];
    if (value?.version !== 2 || !Array.isArray(value.trips) || !Array.isArray(value.trash)
      || trips.some(trip => !trip) || trash.some(entry => !entry || !entry.trip)
      || (value.selectedId !== null && typeof value.selectedId !== "string")) {
      throw new Error("行程数据无法读取，请勿清除浏览器数据。");
    }
    return {
      version: 2,
      trips: trips as Itinerary[],
      trash: trash as DeletedTrip[],
      selectedId: value.selectedId,
    };
  }
  return { version: 2, trips: readLegacyTrips(storage), trash: [], selectedId: storage.getItem(SELECTED_KEY) };
}

function writeLibrary(library: Library, storage: Storage) {
  // Active trips, selected trip and recycle bin commit atomically in a single write.
  storage.setItem(LIBRARY_KEY, JSON.stringify(library));
  // Retire legacy copies only after the new complete record is safely written.
  try { retireLegacy(storage); } catch { /* New record remains authoritative; retry cleanup on the next operation. */ }
}

function retireLegacy(storage: Storage) {
  for (const key of [TRIPS_KEY, SELECTED_KEY, LEGACY_KEY]) storage.removeItem(key);
}

export function readTrips(storage: Storage = window.localStorage): Itinerary[] {
  return readLibrary(storage).trips;
}

export function saveTrip(itinerary: Itinerary, storage: Storage = window.localStorage) {
  const normalized = normalizeTrip(itinerary);
  if (!normalized) throw new Error("行程数据不完整，未保存。");
  const library = readLibrary(storage);
  writeLibrary({ ...library, trips: [normalized, ...library.trips.filter(trip => trip.id !== normalized.id)], trash: library.trash.filter(entry => entry.trip.id !== normalized.id), selectedId: normalized.id }, storage);
}

export function selectTrip(id: string, storage: Storage = window.localStorage) {
  const library = readLibrary(storage);
  if (library.trips.some(trip => trip.id === id)) writeLibrary({ ...library, selectedId: id }, storage);
}

export function readSelectedTrip(storage: Storage = window.localStorage): Itinerary | null {
  const library = readLibrary(storage);
  return library.trips.find(trip => trip.id === library.selectedId) ?? library.trips[0] ?? null;
}

export function readDeletedTrips(storage: Storage = window.localStorage): DeletedTrip[] {
  return readLibrary(storage).trash;
}

export function deleteTrip(id: string, storage: Storage = window.localStorage) {
  const library = readLibrary(storage);
  const trip = library.trips.find(value => value.id === id);
  if (!trip) return;
  const trips = library.trips.filter(value => value.id !== id);
  writeLibrary({ ...library, trips, selectedId: library.selectedId === id ? trips[0]?.id ?? null : library.selectedId, trash: [{ trip, deletedAt: new Date().toISOString() }, ...library.trash.filter(entry => entry.trip.id !== id)] }, storage);
}

export function restoreTrip(id: string, storage: Storage = window.localStorage) {
  const library = readLibrary(storage);
  const entry = library.trash.find(value => value.trip.id === id);
  if (!entry) return;
  writeLibrary({ ...library, trips: [entry.trip, ...library.trips.filter(trip => trip.id !== id)], trash: library.trash.filter(value => value.trip.id !== id), selectedId: id }, storage);
}

export function permanentlyDeleteTrip(id: string, storage: Storage = window.localStorage) {
  const library = readLibrary(storage);
  // Keep the recycle-bin entry if legacy cleanup fails; do not promise full removal.
  if (storage.getItem(LIBRARY_KEY) !== null) retireLegacy(storage);
  writeLibrary({ ...library, trash: library.trash.filter(entry => entry.trip.id !== id) }, storage);
}

export function renameTrip(id: string, title: string, storage: Storage = window.localStorage) {
  title = title.trim();
  if (!title || title.length > 80) throw new Error("行程名称需为 1–80 个字。");
  const library = readLibrary(storage);
  const trip = library.trips.find(value => value.id === id);
  if (!trip) throw new Error("行程不存在。");
  writeLibrary({ ...library, trips: [{ ...trip, title }, ...library.trips.filter(value => value.id !== id)] }, storage);
}

export function duplicateTrip(id: string, storage: Storage = window.localStorage): Itinerary {
  const trip = readLibrary(storage).trips.find(value => value.id === id);
  if (!trip) throw new Error("行程不存在。");
  const copy: Itinerary = { ...structuredClone(trip), id: crypto.randomUUID(), title: `${trip.title.slice(0, 76)}（副本）`, generated_at: new Date().toISOString() };
  saveTrip(copy, storage);
  return copy;
}
