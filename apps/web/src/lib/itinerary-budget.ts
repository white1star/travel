import type {
  BudgetAllocations,
  BudgetCategory,
  CostScope,
  Itinerary,
  TravelReservation,
} from "./types";

export const BUDGET_CATEGORIES = [
  "transport",
  "lodging",
  "food",
  "tickets",
  "local_transport",
  "other",
] as const satisfies readonly BudgetCategory[];

const labels: Record<BudgetCategory, string> = {
  transport: "交通",
  lodging: "住宿",
  food: "餐饮",
  tickets: "门票",
  local_transport: "本地交通",
  other: "其他",
};

export interface BudgetSource {
  id: string;
  category: BudgetCategory;
  label: string;
  kind: "reservation" | "estimate";
  groupAmount: number;
  perPersonAmount: number;
  costScope?: CostScope;
}

export interface BudgetCategorySummary {
  key: BudgetCategory;
  label: string;
  allocationGroup: number;
  allocationPerPerson: number;
  plannedGroup: number;
  plannedPerPerson: number;
  differencePerPerson: number;
  isOver: boolean;
  incomplete: boolean;
  sources: BudgetSource[];
}

export interface BudgetOverview {
  travelers: number;
  totalAvailableGroup: number;
  totalAvailablePerPerson: number;
  plannedGroup: number;
  plannedPerPerson: number;
  remainingGroup: number;
  remainingPerPerson: number;
  allocatedGroup: number;
  allocatedPerPerson: number;
  allocationDifferencePerPerson: number;
  categories: BudgetCategorySummary[];
}

export function reservationCostScope(value: TravelReservation): CostScope {
  return value.cost_scope ?? (value.kind === "transport" ? "per_person" : "total");
}

export function reservationGroupCost(value: TravelReservation, travelers: number): number | undefined {
  if (value.cost === undefined) return undefined;
  return reservationCostScope(value) === "per_person" ? value.cost * Math.max(travelers, 1) : value.cost;
}

export function defaultBudgetAllocations(itinerary: Itinerary): BudgetAllocations {
  if (itinerary.budget.allocations) return { ...itinerary.budget.allocations };
  return {
    transport: itinerary.budget.transport,
    lodging: itinerary.budget.lodging,
    food: itinerary.budget.food,
    tickets: itinerary.budget.tickets,
    local_transport: itinerary.budget.local_transport,
    other: itinerary.budget.other ?? 0,
  };
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function lodgingCoverageIncomplete(itinerary: Itinerary, active: TravelReservation[]): boolean {
  const dates = itinerary.days.map(day => day.date);
  if (!dates.length || dates.some(date => !date)) return false;
  const ordered = (dates as string[]).slice().sort();
  const covered = new Set<string>();
  for (const reservation of active) {
    if (reservation.kind !== "stay") continue;
    for (let date = reservation.check_in_date; date < reservation.check_out_date; date = addDays(date, 1)) {
      covered.add(date);
    }
  }
  for (let date = ordered[0]; date < ordered.at(-1)!; date = addDays(date, 1)) {
    if (!covered.has(date)) return true;
  }
  return false;
}

function estimateSource(category: BudgetCategory, amount: number, travelers: number): BudgetSource {
  return {
    id: `estimate-${category}`,
    category,
    label: "行程生成估算",
    kind: "estimate",
    groupAmount: amount,
    perPersonAmount: amount / travelers,
  };
}

function reservationCategory(
  itinerary: Itinerary,
  category: "transport" | "lodging",
  allocation: number,
  travelers: number,
): BudgetCategorySummary {
  const kind = category === "transport" ? "transport" : "stay";
  const active = (itinerary.reservations ?? []).filter(value => value.status !== "cancelled" && value.kind === kind);
  const known = active.flatMap(value => {
    const groupAmount = reservationGroupCost(value, travelers);
    return groupAmount === undefined ? [] : [{
      id: value.id,
      category,
      label: value.title,
      kind: "reservation" as const,
      groupAmount,
      perPersonAmount: groupAmount / travelers,
      costScope: reservationCostScope(value),
    }];
  });
  const estimate = category === "transport" ? itinerary.budget.transport : itinerary.budget.lodging;
  const plannedGroup = known.length ? known.reduce((total, source) => total + source.groupAmount, 0) : estimate;
  const incomplete = active.some(value => value.cost === undefined)
    || (category === "lodging" && lodgingCoverageIncomplete(itinerary, active));
  return {
    key: category,
    label: labels[category],
    allocationGroup: allocation,
    allocationPerPerson: allocation / travelers,
    plannedGroup,
    plannedPerPerson: plannedGroup / travelers,
    differencePerPerson: (allocation - plannedGroup) / travelers,
    isOver: plannedGroup > allocation,
    incomplete,
    sources: known.length ? known : [estimateSource(category, estimate, travelers)],
  };
}

function estimateCategory(
  itinerary: Itinerary,
  category: Exclude<BudgetCategory, "transport" | "lodging">,
  allocation: number,
  travelers: number,
): BudgetCategorySummary {
  const plannedGroup = category === "other" ? itinerary.budget.other ?? 0 : itinerary.budget[category];
  return {
    key: category,
    label: labels[category],
    allocationGroup: allocation,
    allocationPerPerson: allocation / travelers,
    plannedGroup,
    plannedPerPerson: plannedGroup / travelers,
    differencePerPerson: (allocation - plannedGroup) / travelers,
    isOver: plannedGroup > allocation,
    incomplete: false,
    sources: [estimateSource(category, plannedGroup, travelers)],
  };
}

export function getBudgetOverview(itinerary: Itinerary): BudgetOverview {
  const travelers = Math.max(itinerary.travelers, 1);
  const allocations = defaultBudgetAllocations(itinerary);
  const categories: BudgetCategorySummary[] = BUDGET_CATEGORIES.map(category => {
    if (category === "transport" || category === "lodging") {
      return reservationCategory(itinerary, category, allocations[category], travelers);
    }
    return estimateCategory(itinerary, category, allocations[category], travelers);
  });
  const plannedGroup = categories.reduce((total, category) => total + category.plannedGroup, 0);
  const allocatedGroup = categories.reduce((total, category) => total + category.allocationGroup, 0);
  const remainingGroup = itinerary.budget.total_available - plannedGroup;
  return {
    travelers,
    totalAvailableGroup: itinerary.budget.total_available,
    totalAvailablePerPerson: itinerary.budget.total_available / travelers,
    plannedGroup,
    plannedPerPerson: plannedGroup / travelers,
    remainingGroup,
    remainingPerPerson: remainingGroup / travelers,
    allocatedGroup,
    allocatedPerPerson: allocatedGroup / travelers,
    allocationDifferencePerPerson: (itinerary.budget.total_available - allocatedGroup) / travelers,
    categories,
  };
}

export function getPerPersonAllocations(itinerary: Itinerary): BudgetAllocations {
  const travelers = Math.max(itinerary.travelers, 1);
  const allocations = defaultBudgetAllocations(itinerary);
  return Object.fromEntries(BUDGET_CATEGORIES.map(category => [category, allocations[category] / travelers])) as BudgetAllocations;
}

export function validatePerPersonAllocations(value: BudgetAllocations): Partial<Record<BudgetCategory, string>> {
  const errors: Partial<Record<BudgetCategory, string>> = {};
  for (const category of BUDGET_CATEGORIES) {
    if (!Number.isFinite(value[category]) || value[category] < 0) {
      errors[category] = "请输入大于或等于 0 的有效金额";
    }
  }
  return errors;
}

export function applyPerPersonAllocations(itinerary: Itinerary, value: BudgetAllocations): Itinerary {
  if (Object.keys(validatePerPersonAllocations(value)).length) throw new Error("分类预算金额无效。");
  const travelers = Math.max(itinerary.travelers, 1);
  const allocations = Object.fromEntries(
    BUDGET_CATEGORIES.map(category => [category, value[category] * travelers]),
  ) as BudgetAllocations;
  return { ...itinerary, budget: { ...itinerary.budget, allocations } };
}
