import { findLocalPlace, getLocalPlaces, type LocalPlace } from "./local-place-catalog";
import type {
  BudgetAllocations,
  Itinerary,
  ItineraryDay,
  ItineraryItem,
  Pace,
  TripDraft,
} from "./types";

export type LocalPlanResult = {
  itinerary: Itinerary;
  notices: string[];
};

const CAPACITY: Record<Pace, number> = { relaxed: 2, balanced: 3, compact: 4 };
const INTENSITY: Record<Pace, ItineraryDay["intensity"]> = {
  relaxed: "轻松",
  balanced: "适中",
  compact: "紧凑",
};
const TITLE: Record<Pace, string> = {
  relaxed: "轻松漫游",
  balanced: "城市探索",
  compact: "丰富体验",
};
const ALLOCATION_RATIOS: Array<[keyof BudgetAllocations, number]> = [
  ["transport", 0.2],
  ["lodging", 0.3],
  ["food", 0.2],
  ["tickets", 0.15],
  ["local_transport", 0.05],
];

function uniqueNames(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function allocateCities(destinations: string[], days: number) {
  if (days < destinations.length) {
    return { cities: destinations.slice(0, days), omitted: destinations.slice(days) };
  }
  const counts = destinations.map(() => 1);
  for (let index = destinations.length; index < days; index += 1) {
    counts[(index - destinations.length) % destinations.length] += 1;
  }
  return {
    cities: destinations.flatMap((city, index) => Array.from({ length: counts[index] }, () => city)),
    omitted: [] as string[],
  };
}

function allocateBudget(total: number): BudgetAllocations {
  const totalCents = Math.max(0, Math.round(total * 100));
  const cents = {} as Record<keyof BudgetAllocations, number>;
  let assigned = 0;
  for (const [category, ratio] of ALLOCATION_RATIOS) {
    cents[category] = Math.round(totalCents * ratio);
    assigned += cents[category];
  }
  cents.other = totalCents - assigned;
  return {
    transport: cents.transport / 100,
    lodging: cents.lodging / 100,
    food: cents.food / 100,
    tickets: cents.tickets / 100,
    local_transport: cents.local_transport / 100,
    other: cents.other / 100,
  };
}

function timeLabel(minutes: number) {
  const normalized = Math.max(0, minutes);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function itemFromPlace(place: LocalPlace, locked: boolean): ItineraryItem {
  return {
    time: "09:00",
    end_time: "09:00",
    name: place.name,
    category: place.category,
    duration_minutes: place.suggestedDurationMinutes,
    description: place.description,
    cost: place.estimatedCostPerPerson,
    locked,
    verified_hours: false,
    notice: "开放时间与票价需确认",
    coordinate: place.coordinate ? [...place.coordinate] : [0, 0],
  };
}

function pendingRequiredItem(name: string): ItineraryItem {
  return {
    time: "09:00",
    end_time: "09:00",
    name,
    category: "用户必去 · 待定位",
    duration_minutes: 90,
    description: "由你添加，保存后可在行程中搜索并定位。",
    cost: 0,
    locked: true,
    verified_hours: false,
    notice: "待定位",
    coordinate: [0, 0],
  };
}

function scorePlaces(places: LocalPlace[], interests: string[]) {
  const selected = new Set(interests);
  return places
    .map((place, index) => ({
      place,
      index,
      score: place.interests.reduce((sum, interest) => sum + Number(selected.has(interest)), 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(entry => entry.place);
}

function assignTimes(items: ItineraryItem[]) {
  let cursor = 9 * 60;
  return items.map(item => {
    const end = cursor + item.duration_minutes;
    const timed = { ...item, time: timeLabel(cursor), end_time: timeLabel(end) };
    cursor = end + 30;
    return timed;
  });
}

function dateForDay(draft: TripDraft, index: number) {
  if (draft.dateMode === "flexible") return null;
  const date = new Date(`${draft.startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

export function createLocalItinerary(
  draft: TripDraft,
  options: { id?: string; generatedAt?: string } = {},
): LocalPlanResult {
  const destinations = uniqueNames(draft.destinations);
  const requiredNames = uniqueNames(draft.requiredPlaces);
  const interests = uniqueNames(draft.interests);
  const { cities, omitted } = allocateCities(destinations, draft.days);
  const totalAvailable = money(draft.budgetPerPerson * draft.travelers);
  const allocations = allocateBudget(totalAvailable);
  const notices: string[] = [];
  if (omitted.length) notices.push(`旅行天数不足，${omitted.join("、")}暂未排入每日行程，请增加天数。`);

  const dayRequired = cities.map(() => [] as ItineraryItem[]);
  const cityDayIndexes = new Map<string, number[]>();
  cities.forEach((city, index) => cityDayIndexes.set(city, [...(cityDayIndexes.get(city) ?? []), index]));
  const cityRequiredCounts = new Map<string, number>();
  let unknownIndex = 0;

  for (const name of requiredNames) {
    const known = findLocalPlace(name);
    const eligibleIndexes = known ? cityDayIndexes.get(known.city) : undefined;
    if (known && eligibleIndexes?.length) {
      const occurrence = cityRequiredCounts.get(known.city) ?? 0;
      dayRequired[eligibleIndexes[occurrence % eligibleIndexes.length]].push(itemFromPlace(known, true));
      cityRequiredCounts.set(known.city, occurrence + 1);
      continue;
    }
    if (cities.length) {
      dayRequired[unknownIndex % cities.length].push(pendingRequiredItem(name));
      unknownIndex += 1;
    }
  }

  const used = new Set(requiredNames.map(name => name.trim()));
  let ticketSpend = dayRequired.flat().reduce((sum, item) => sum + item.cost * draft.travelers, 0);
  const days = cities.map((city, index): ItineraryDay => {
    const required = dayRequired[index];
    if (required.length > CAPACITY[draft.pace]) {
      notices.push(`第 ${index + 1} 天必去地点较多，安排超过所选节奏。`);
    }
    const selected = [...required];
    const candidates = scorePlaces(getLocalPlaces(city), interests);
    for (const candidate of candidates) {
      if (selected.length >= Math.max(CAPACITY[draft.pace], required.length)) break;
      if (used.has(candidate.name)) continue;
      const nextTicketSpend = ticketSpend + candidate.estimatedCostPerPerson * draft.travelers;
      if (candidate.estimatedCostPerPerson > 0 && nextTicketSpend > allocations.tickets) continue;
      const nextEnd = 9 * 60 + selected.reduce((sum, item) => sum + item.duration_minutes + 30, 0)
        + candidate.suggestedDurationMinutes;
      if (nextEnd > 19 * 60) continue;
      selected.push(itemFromPlace(candidate, false));
      used.add(candidate.name);
      ticketSpend = nextTicketSpend;
    }
    return {
      day: index + 1,
      date: dateForDay(draft, index),
      city,
      title: `${city} · ${TITLE[draft.pace]}`,
      intensity: INTENSITY[draft.pace],
      items: assignTimes(selected),
    };
  });

  for (const city of new Set(cities)) {
    if (getLocalPlaces(city).length === 0) notices.push(`${city}的本地点位尚未收录，当天地点待完善。`);
  }

  const transport = money((destinations.length + Number(draft.returnToOrigin)) * draft.travelers * 120);
  const lodging = money(Math.max(draft.days - 1, 0) * draft.travelers * 180);
  const food = money(draft.days * draft.travelers * 120);
  const localTransport = money(draft.days * draft.travelers * 40);
  const tickets = money(days.flatMap(day => day.items).reduce((sum, item) => sum + item.cost * draft.travelers, 0));
  const other = 0;
  const estimatedTotal = money(transport + lodging + food + tickets + localTransport + other);
  if (tickets > allocations.tickets) notices.push("必去地点门票费用超过门票分类额度，但已按你的要求保留。");
  if (estimatedTotal > totalAvailable) notices.push("当前规划估算超过总预算，可保存后调整分类额度或行程安排。");

  const route = [draft.origin.trim(), ...destinations, ...(draft.returnToOrigin ? [draft.origin.trim()] : [])];
  return {
    itinerary: {
      id: options.id ?? crypto.randomUUID(),
      title: `${destinations.join("")}${draft.days}日游`,
      travelers: draft.travelers,
      route,
      days,
      budget: {
        total_available: totalAvailable,
        estimated_total: estimatedTotal,
        remaining: money(totalAvailable - estimatedTotal),
        transport,
        lodging,
        tickets,
        local_transport: localTransport,
        food,
        other,
        allocations,
      },
      generated_at: options.generatedAt ?? new Date().toISOString(),
      data_notice: "本行程由本地规则生成；地点开放时间、票价和交通需在出发前确认。",
      reservations: [],
    },
    notices,
  };
}
