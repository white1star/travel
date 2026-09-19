import type {
  Itinerary,
  StayReservation,
  TravelReservation,
  TransportReservation,
} from "./types";
import { reservationGroupCost } from "./itinerary-budget";

export interface ReservationIssue {
  code: "missing-stay" | "activity-conflict" | "outside-trip";
  message: string;
  reservationId?: string;
  date?: string;
}

export interface TripReadiness {
  confirmed: number;
  planned: number;
  coveredNights: number;
  totalNights: number;
  recordedCost: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const transportModes = new Set(["flight", "train", "coach", "ferry", "drive", "other"]);
const stayTypes = new Set(["hotel", "homestay", "hostel", "friends", "other"]);
const statuses = new Set(["planned", "confirmed", "cancelled"]);
const costScopes = new Set(["per_person", "total"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isValidDateTime(value: string): boolean {
  return DATETIME_PATTERN.test(value) && isValidDate(value.slice(0, 10));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function addLengthError(errors: Record<string, string>, key: string, value: string | undefined, max: number): void {
  if (value !== undefined && value.length > max) errors[key] = `最多输入 ${max} 个字符`;
}

export function validateReservation(value: TravelReservation): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!value.title.trim()) errors.title = "请输入名称";
  addLengthError(errors, "title", value.title, 80);
  addLengthError(errors, "provider", value.provider, 80);
  addLengthError(errors, "confirmation_number", value.confirmation_number, 80);
  addLengthError(errors, "notes", value.notes, 500);

  if (value.cost !== undefined && (!Number.isFinite(value.cost) || value.cost < 0)) {
    errors.cost = "费用必须为大于或等于 0 的数字";
  }

  if (value.kind === "transport") {
    if (!value.departure_place.trim()) errors.departure_place = "请输入出发地点";
    if (!value.arrival_place.trim()) errors.arrival_place = "请输入到达地点";
    addLengthError(errors, "departure_place", value.departure_place, 120);
    addLengthError(errors, "arrival_place", value.arrival_place, 120);
    addLengthError(errors, "service_number", value.service_number, 80);

    if (!isValidDateTime(value.departure_at)) errors.departure_at = "请选择有效的出发时间";
    if (!isValidDateTime(value.arrival_at)) errors.arrival_at = "请选择有效的到达时间";
    if (isValidDateTime(value.departure_at) && isValidDateTime(value.arrival_at)
      && value.arrival_at <= value.departure_at) {
      errors.arrival_at = "到达时间必须晚于出发时间";
    }
  } else {
    addLengthError(errors, "address", value.address, 160);
    addLengthError(errors, "contact", value.contact, 80);
    if (!isValidDate(value.check_in_date)) errors.check_in_date = "请选择有效的入住日期";
    if (!isValidDate(value.check_out_date)) errors.check_out_date = "请选择有效的退房日期";
    if (isValidDate(value.check_in_date) && isValidDate(value.check_out_date)
      && value.check_out_date <= value.check_in_date) {
      errors.check_out_date = "退房日期必须晚于入住日期";
    }
  }

  return errors;
}

export function isTravelReservation(value: unknown): value is TravelReservation {
  if (!isObject(value)
    || typeof value.id !== "string" || !value.id.trim()
    || typeof value.title !== "string"
    || typeof value.status !== "string" || !statuses.has(value.status)
    || !optionalString(value.provider)
    || !optionalString(value.confirmation_number)
    || !optionalString(value.notes)
    || (value.cost_scope !== undefined && (typeof value.cost_scope !== "string" || !costScopes.has(value.cost_scope)))
    || (value.cost !== undefined && typeof value.cost !== "number")) {
    return false;
  }

  if (value.kind === "transport") {
    if (typeof value.mode !== "string" || !transportModes.has(value.mode)
      || typeof value.departure_at !== "string"
      || typeof value.arrival_at !== "string"
      || typeof value.departure_place !== "string"
      || typeof value.arrival_place !== "string"
      || !optionalString(value.service_number)) return false;
  } else if (value.kind === "stay") {
    if (typeof value.stay_type !== "string" || !stayTypes.has(value.stay_type)
      || typeof value.check_in_date !== "string"
      || typeof value.check_out_date !== "string"
      || !optionalString(value.address)
      || !optionalString(value.contact)) return false;
  } else {
    return false;
  }

  return Object.keys(validateReservation(value as unknown as TravelReservation)).length === 0;
}

export function upsertReservation(itinerary: Itinerary, reservation: TravelReservation): Itinerary {
  const current = itinerary.reservations ?? [];
  const index = current.findIndex(value => value.id === reservation.id);
  const reservations = index < 0
    ? [...current, reservation]
    : current.map(value => value.id === reservation.id ? reservation : value);
  return { ...itinerary, reservations };
}

export function removeReservation(itinerary: Itinerary, reservationId: string): Itinerary {
  return {
    ...itinerary,
    reservations: (itinerary.reservations ?? []).filter(value => value.id !== reservationId),
  };
}

function reservationTime(value: TravelReservation): string {
  return value.kind === "transport" ? value.departure_at : `${value.check_in_date}T15:00`;
}

export function sortReservations(values: readonly TravelReservation[]): TravelReservation[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => reservationTime(left.value).localeCompare(reservationTime(right.value)) || left.index - right.index)
    .map(entry => entry.value);
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) result.push(date);
  return result;
}

function tripBounds(itinerary: Itinerary): { first: string; last: string; dayAfterLast: string } | null {
  const dates = itinerary.days.map(day => day.date).filter((date): date is string => Boolean(date));
  if (!dates.length || dates.length !== itinerary.days.length) return null;
  const ordered = [...dates].sort();
  return { first: ordered[0], last: ordered.at(-1)!, dayAfterLast: addDays(ordered.at(-1)!, 1) };
}

function activeReservations(itinerary: Itinerary): TravelReservation[] {
  return (itinerary.reservations ?? []).filter(value => value.status !== "cancelled");
}

function coveredNights(itinerary: Itinerary, bounds: NonNullable<ReturnType<typeof tripBounds>>): Set<string> {
  const tripNights = new Set(datesBetween(bounds.first, bounds.last));
  const covered = new Set<string>();
  for (const reservation of activeReservations(itinerary)) {
    if (reservation.kind !== "stay") continue;
    for (const date of datesBetween(reservation.check_in_date, reservation.check_out_date)) {
      if (tripNights.has(date)) covered.add(date);
    }
  }
  return covered;
}

export function getTripReadiness(itinerary: Itinerary): TripReadiness {
  const active = activeReservations(itinerary);
  const bounds = tripBounds(itinerary);
  const totalNights = bounds ? datesBetween(bounds.first, bounds.last).length : 0;
  return {
    confirmed: active.filter(value => value.status === "confirmed").length,
    planned: active.filter(value => value.status === "planned").length,
    coveredNights: bounds ? coveredNights(itinerary, bounds).size : 0,
    totalNights,
    recordedCost: active.reduce((total, value) => total + (reservationGroupCost(value, itinerary.travelers) ?? 0), 0),
  };
}

function outsideTrip(reservation: TravelReservation, bounds: NonNullable<ReturnType<typeof tripBounds>>): boolean {
  if (reservation.kind === "stay") {
    return reservation.check_out_date <= bounds.first || reservation.check_in_date >= bounds.dayAfterLast;
  }
  const start = `${bounds.first}T00:00`;
  const end = `${bounds.dayAfterLast}T00:00`;
  return reservation.arrival_at < start || reservation.departure_at >= end;
}

export function findReservationIssues(itinerary: Itinerary): ReservationIssue[] {
  const issues: ReservationIssue[] = [];
  const active = activeReservations(itinerary);
  const bounds = tripBounds(itinerary);

  if (bounds) {
    const covered = coveredNights(itinerary, bounds);
    for (const date of datesBetween(bounds.first, bounds.last)) {
      if (!covered.has(date)) {
        issues.push({ code: "missing-stay", date, message: `${date} 晚尚未安排住宿` });
      }
    }

    for (const reservation of active) {
      if (outsideTrip(reservation, bounds)) {
        issues.push({ code: "outside-trip", reservationId: reservation.id, message: `${reservation.title} 不在本次旅行日期内` });
      }
    }
  }

  for (const reservation of active) {
    if (reservation.kind !== "transport") continue;
    for (const day of itinerary.days) {
      if (!day.date) continue;
      for (const item of day.items) {
        if (item.category.includes("交通")) continue;
        const itemStart = `${day.date}T${item.time}`;
        const itemEnd = `${day.date}T${item.end_time}`;
        if (reservation.departure_at < itemEnd && reservation.arrival_at > itemStart) {
          issues.push({
            code: "activity-conflict",
            reservationId: reservation.id,
            date: day.date,
            message: `${reservation.title} 与“${item.name}”时间重叠`,
          });
        }
      }
    }
  }

  return issues;
}
