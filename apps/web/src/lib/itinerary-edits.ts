import type { Itinerary, ItineraryDay, ItineraryItem } from "./types";

export type ScheduleMove = {
  fromDayIndex: number;
  fromItemIndex: number;
  toDayIndex: number;
  toItemIndex: number;
};

export type ScheduleIssue = {
  kind: "overlap" | "late" | "dense" | "unlocated";
  message: string;
  itemIndexes: number[];
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function clockMinutes(value: string) {
  if (!TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function validItem(item: ItineraryItem) {
  return item.name.trim().length > 0 && Number.isFinite(item.cost) && item.cost >= 0
    && Number.isInteger(item.duration_minutes) && item.duration_minutes > 0
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.end_time) && item.end_time > item.time;
}

function adjustBudget(next: Itinerary, amount: number, category: string) {
  const bucket = category === "城际交通" ? "transport" : category === "自定义安排" ? "other"
    : category === "餐饮" ? "food" : category === "住宿" ? "lodging" : category === "市内交通" ? "local_transport" : "tickets";
  next.budget[bucket] = Math.max(0, (next.budget[bucket] ?? 0) + amount);
  next.budget.estimated_total = Math.max(0, next.budget.estimated_total + amount);
  next.budget.remaining = next.budget.total_available - next.budget.estimated_total;
}

function invalidateLocalTransport(items: ItineraryItem[]) {
  items.forEach(item => {
    if (item.category !== "城际交通") { item.transport = null; item.transport_minutes = null; }
  });
}

function normalizeDayInPlace(day: ItineraryDay, startTime?: string) {
  const fallback = day.items[0]?.time ?? "09:00";
  let cursor = clockMinutes(startTime ?? fallback) ?? 9 * 60;
  day.items.forEach((item) => {
    item.time = formatClock(cursor);
    const end = Math.min(cursor + item.duration_minutes, 1439);
    item.end_time = formatClock(end);
    cursor = end + 30;
  });
  invalidateLocalTransport(day.items);
}

export function normalizeDayTimes(itinerary: Itinerary, dayIndex: number, startTime?: string): Itinerary {
  const day = itinerary.days[dayIndex];
  if (!day || (startTime !== undefined && clockMinutes(startTime) === null)) return itinerary;
  const next = structuredClone(itinerary);
  normalizeDayInPlace(next.days[dayIndex], startTime);
  return next;
}

export function moveScheduleItem(itinerary: Itinerary, move: ScheduleMove): Itinerary {
  const source = itinerary.days[move.fromDayIndex];
  const target = itinerary.days[move.toDayIndex];
  const item = source?.items[move.fromItemIndex];
  if (!source || !target || !item || source.city !== target.city) return itinerary;
  if (!Number.isInteger(move.toItemIndex) || move.toItemIndex < 0 || move.toItemIndex > target.items.length) return itinerary;
  if (move.fromDayIndex === move.toDayIndex && move.fromItemIndex === move.toItemIndex) return itinerary;

  const sourceStart = source.items[0]?.time ?? "09:00";
  const targetStart = target.items[0]?.time ?? "09:00";
  const next = structuredClone(itinerary);
  const [moved] = next.days[move.fromDayIndex].items.splice(move.fromItemIndex, 1);
  const targetItems = next.days[move.toDayIndex].items;
  const insertionIndex = Math.min(move.toItemIndex, targetItems.length);
  targetItems.splice(insertionIndex, 0, moved);

  normalizeDayInPlace(next.days[move.fromDayIndex], sourceStart);
  if (move.toDayIndex !== move.fromDayIndex) normalizeDayInPlace(next.days[move.toDayIndex], targetStart);
  return next;
}

function itemIdentity(item: ItineraryItem) {
  return item.poi_id?.trim() ? `poi:${item.poi_id.trim()}` : `name:${item.name.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN")}`;
}

export function duplicateDayItems(itinerary: Itinerary, fromDayIndex: number, toDayIndex: number): Itinerary {
  const source = itinerary.days[fromDayIndex];
  const target = itinerary.days[toDayIndex];
  if (!source || !target || fromDayIndex === toDayIndex || source.city !== target.city) return itinerary;
  const existing = new Set(target.items.map(itemIdentity));
  const additions = source.items.filter((item) => {
    const identity = itemIdentity(item);
    if (existing.has(identity)) return false;
    existing.add(identity);
    return true;
  });
  if (additions.length === 0) return itinerary;

  const next = structuredClone(itinerary);
  const startTime = target.items[0]?.time ?? "09:00";
  for (const item of additions) {
    next.days[toDayIndex].items.push(structuredClone(item));
    adjustBudget(next, item.cost * next.travelers, item.category);
  }
  normalizeDayInPlace(next.days[toDayIndex], startTime);
  return next;
}

export function clearDayItems(itinerary: Itinerary, dayIndex: number): Itinerary {
  const day = itinerary.days[dayIndex];
  if (!day) return itinerary;
  const removed = day.items.filter((item) => !item.locked);
  if (removed.length === 0) return itinerary;

  const next = structuredClone(itinerary);
  const startTime = day.items[0]?.time ?? "09:00";
  next.days[dayIndex].items = next.days[dayIndex].items.filter((item) => item.locked);
  for (const item of removed) adjustBudget(next, -item.cost * next.travelers, item.category);
  normalizeDayInPlace(next.days[dayIndex], startTime);
  return next;
}

export function updateItemTiming(itinerary: Itinerary, dayIndex: number, itemIndex: number, time: string, durationMinutes: number): Itinerary {
  const selected = itinerary.days[dayIndex]?.items[itemIndex];
  const start = clockMinutes(time);
  if (!selected || start === null || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || start + durationMinutes > 1439) return itinerary;
  if (selected.time === time && selected.duration_minutes === durationMinutes) return itinerary;

  const next = structuredClone(itinerary);
  const item = next.days[dayIndex].items[itemIndex];
  item.time = time;
  item.duration_minutes = durationMinutes;
  item.end_time = formatClock(start + durationMinutes);
  next.days[dayIndex].items.sort((left, right) => left.time.localeCompare(right.time));
  invalidateLocalTransport(next.days[dayIndex].items);
  return next;
}

export function analyzeDaySchedule(day: ItineraryDay): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  for (let left = 0; left < day.items.length; left++) {
    const leftStart = clockMinutes(day.items[left].time);
    const leftEnd = clockMinutes(day.items[left].end_time);
    if (leftStart === null || leftEnd === null) continue;
    for (let right = left + 1; right < day.items.length; right++) {
      const rightStart = clockMinutes(day.items[right].time);
      const rightEnd = clockMinutes(day.items[right].end_time);
      if (rightStart !== null && rightEnd !== null && leftStart < rightEnd && rightStart < leftEnd) {
        issues.push({ kind: "overlap", message: `${day.items[left].name}与${day.items[right].name}时间重叠`, itemIndexes: [left, right] });
      }
    }
  }

  const latestEnd = day.items.reduce((latest, item) => Math.max(latest, clockMinutes(item.end_time) ?? 0), 0);
  if (latestEnd > 19 * 60) {
    const indexes = day.items.map((item, index) => (clockMinutes(item.end_time) ?? 0) === latestEnd ? index : -1).filter((index) => index >= 0);
    issues.push({ kind: "late", message: "当天最后一项在 19:00 后结束", itemIndexes: indexes });
  }

  const limits: Record<ItineraryDay["intensity"], number> = { "轻松": 2, "适中": 3, "紧凑": 4 };
  if (day.items.length > limits[day.intensity]) {
    issues.push({ kind: "dense", message: `${day.intensity}节奏下安排偏多，建议留出机动时间`, itemIndexes: day.items.map((_, index) => index) });
  }

  day.items.forEach((item, index) => {
    const [lng, lat] = item.coordinate;
    if (item.location_source !== "amap" || !Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) {
      issues.push({ kind: "unlocated", message: `${item.name}尚未通过高德定位`, itemIndexes: [index] });
    }
  });
  return issues;
}

export function addItem(itinerary: Itinerary, dayIndex: number, item: ItineraryItem): Itinerary {
  if (!itinerary.days[dayIndex] || !validItem(item)) return itinerary;
  const next = structuredClone(itinerary);
  next.days[dayIndex].items.push(structuredClone(item));
  next.days[dayIndex].items.sort((a, b) => a.time.localeCompare(b.time));
  invalidateLocalTransport(next.days[dayIndex].items);
  adjustBudget(next, item.cost * next.travelers, item.category);
  return next;
}

export function addRecommendedItems(itinerary: Itinerary, dayIndex: number, items: ItineraryItem[]): Itinerary {
  const day = itinerary.days[dayIndex];
  if (!day) return itinerary;
  const identities = new Set(day.items.map(itemIdentity));
  const additions = items.filter((item) => {
    const [lng, lat] = item.coordinate;
    if (!validItem(item) || item.location_source !== "amap" || !item.poi_id?.trim()
      || !Number.isFinite(lng) || !Number.isFinite(lat)
      || Math.abs(lng) > 180 || Math.abs(lat) > 90 || (lng === 0 && lat === 0)) return false;
    const identity = itemIdentity(item);
    const normalizedName = `name:${item.name.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN")}`;
    if (identities.has(identity) || identities.has(normalizedName)
      || day.items.some((existing) => itemIdentity(existing) === normalizedName)) return false;
    identities.add(identity);
    identities.add(normalizedName);
    return true;
  });
  if (!additions.length) return itinerary;

  const next = structuredClone(itinerary);
  for (const item of additions) {
    next.days[dayIndex].items.push(structuredClone(item));
    adjustBudget(next, item.cost * next.travelers, item.category);
  }
  next.days[dayIndex].items.sort((left, right) => left.time.localeCompare(right.time));
  invalidateLocalTransport(next.days[dayIndex].items);
  return next;
}

export function replaceItem(itinerary: Itinerary, dayIndex: number, itemIndex: number, item: ItineraryItem): Itinerary {
  const previous = itinerary.days[dayIndex]?.items[itemIndex];
  if (!previous || previous.locked || !validItem(item)) return itinerary;
  const next = structuredClone(itinerary);
  next.days[dayIndex].items[itemIndex] = structuredClone(item);
  next.days[dayIndex].items.sort((a, b) => a.time.localeCompare(b.time));
  invalidateLocalTransport(next.days[dayIndex].items);
  adjustBudget(next, -previous.cost * next.travelers, previous.category);
  adjustBudget(next, item.cost * next.travelers, item.category);
  return next;
}

export function moveItemToDay(itinerary: Itinerary, fromDay: number, itemIndex: number, toDay: number): Itinerary {
  const source = itinerary.days[fromDay];
  const target = itinerary.days[toDay];
  if (!source?.items[itemIndex] || !target || source.city !== target.city || fromDay === toDay) return itinerary;
  const next = structuredClone(itinerary);
  const [item] = next.days[fromDay].items.splice(itemIndex, 1);
  invalidateLocalTransport(next.days[fromDay].items);
  next.days[toDay].items.push(item);
  next.days[toDay].items.sort((a, b) => a.time.localeCompare(b.time));
  invalidateLocalTransport(next.days[toDay].items);
  return next;
}

export function findScheduleConflicts(items: ItineraryItem[]): string[] {
  const conflicts: string[] = [];
  for (let left = 0; left < items.length; left++) {
    for (let right = left + 1; right < items.length; right++) {
      if (items[left].time < items[right].end_time && items[right].time < items[left].end_time) {
        conflicts.push(`${items[left].name}与${items[right].name}的时间重叠`);
      }
    }
  }
  return conflicts;
}

function moveClock(value: string, minutes: number) {
  const [hours, mins] = value.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function shiftItemTime(itinerary: Itinerary, dayIndex: number, itemIndex: number, minutes: number): Itinerary {
  const selected = itinerary.days[dayIndex]?.items[itemIndex];
  if (!selected || !Number.isInteger(minutes)) return itinerary;
  const clockMinutes = (value: string) => { const [hours, mins] = value.split(":").map(Number); return hours * 60 + mins; };
  if (clockMinutes(selected.time) + minutes < 0 || clockMinutes(selected.end_time) + minutes >= 1440) return itinerary;
  const next = structuredClone(itinerary);
  const item = next.days[dayIndex]?.items[itemIndex];
  if (!item) return itinerary;
  item.time = moveClock(item.time, minutes);
  item.end_time = moveClock(item.end_time, minutes);
  next.days[dayIndex].items.sort((a, b) => a.time.localeCompare(b.time));
  invalidateLocalTransport(next.days[dayIndex].items);
  return next;
}

export function removeItem(itinerary: Itinerary, dayIndex: number, itemIndex: number): Itinerary {
  const item = itinerary.days[dayIndex]?.items[itemIndex];
  if (!item || item.locked) return itinerary;
  const next = structuredClone(itinerary);
  next.days[dayIndex].items.splice(itemIndex, 1);
  invalidateLocalTransport(next.days[dayIndex].items);
  adjustBudget(next, -item.cost * itinerary.travelers, item.category);
  return next;
}

export function swapDestinationOrder(itinerary: Itinerary): Itinerary {
  const hasReturn = itinerary.route.length > 2 && itinerary.route[0] === itinerary.route.at(-1);
  const destinations = itinerary.route.slice(1, hasReturn ? -1 : undefined);
  if (destinations.length !== 2 || destinations[0] === destinations[1]) return itinerary;

  const reordered = [...destinations].reverse();
  const dates = itinerary.days.map((day) => day.date);
  const days = [...itinerary.days]
    .sort((left, right) => reordered.indexOf(left.city) - reordered.indexOf(right.city))
    .map((day, index) => ({ ...structuredClone(day), day: index + 1, date: dates[index] ?? null }));

  return {
    ...structuredClone(itinerary),
    title: `${reordered.join("")}${days.length}日游`,
    route: [itinerary.route[0], ...reordered, ...(hasReturn ? [itinerary.route[0]] : [])],
    days,
  };
}
