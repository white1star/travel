# Travel Budget Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete pre-trip budget workspace where travelers can allocate per-person category budgets, understand planned-cost sources, and save the result without breaking existing trips.

**Architecture:** Keep persisted money values in group totals. Add one pure budget domain module that converts reservation costs, derives budget summaries and applies per-person allocation edits. Normalize optional legacy fields at the storage boundary, then expose the feature through a controlled budget editor owned by `ItineraryView` so the existing dirty, undo, save and navigation-warning behavior remains the single source of truth.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Vitest, Testing Library, existing CSS design system and localStorage trip library.

**Spec:** `docs/superpowers/specs/2026-09-19-travel-budget-center-design.md`

## Global Constraints

- Do not change the homepage, map integration, itinerary-generation flow, Netlify configuration or deployment state.
- Do not add actual-expense tracking, payments, booking APIs, cloud sync, export, multi-currency or bill splitting.
- Keep `travel:library:v2`; all added persisted fields stay optional at the TypeScript boundary for legacy compatibility.
- Persist budget allocations as group totals. Only the UI and presentation model use per-person values.
- A known zero cost is not an unknown cost. Use `cost === undefined` checks, never truthiness checks.
- Cancelled reservations never contribute to planned spend. A valid explicit reservation total replaces the old aggregate estimate at the whole-category level; it is not added to it.
- Budget summaries must never expose confirmation numbers, contact details or notes.
- Keep the current mint palette, borders and restrained shadows. Add no gradients, new brand color or large image asset.
- The workspace is nested beneath a broader Git repository and is not a safe standalone repository. Do not create a worktree, commit, push or rewrite Git state here. Each task ends with tests and a read-only diff/checkpoint instead of a commit.
- Use test-driven development: write the named failing test first, observe the expected failure, implement only enough to pass, then run the focused regression set.

## Review Focus

1. Verify all calculations distinguish group totals from per-person display and handle one or many travelers without rounding stored data.
2. Verify partial reservation data replaces a category estimate only when at least one explicit active cost exists, while unknown active costs produce an incomplete warning.
3. Verify `0` remains a valid known amount and `undefined` remains unknown across forms, normalization and summaries.
4. Verify old trips gain compatible in-memory defaults while illegal explicit `allocations`, `cost_scope` or traveler counts make the complete v2 library unreadable without overwriting its raw value.
5. Verify budget drafts survive workspace switches, block global save until confirmed or cancelled, and join the existing commit/undo/save lifecycle exactly once.

---

## Task 1: Add the budget domain types and pure calculation model

**Files:**

- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/itinerary-budget.ts`
- Create: `apps/web/src/lib/itinerary-budget.test.ts`

**Interfaces:**

```ts
export type CostScope = "per_person" | "total";

export type BudgetCategory =
  | "transport"
  | "lodging"
  | "food"
  | "tickets"
  | "local_transport"
  | "other";

export type BudgetAllocations = Record<BudgetCategory, number>;

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
```

Required public functions in `itinerary-budget.ts`:

```ts
export const BUDGET_CATEGORIES: readonly BudgetCategory[];
export function defaultBudgetAllocations(itinerary: Itinerary): BudgetAllocations;
export function reservationCostScope(value: TravelReservation): CostScope;
export function reservationGroupCost(value: TravelReservation, travelers: number): number | undefined;
export function getBudgetOverview(itinerary: Itinerary): BudgetOverview;
export function getPerPersonAllocations(itinerary: Itinerary): BudgetAllocations;
export function validatePerPersonAllocations(value: BudgetAllocations): Partial<Record<BudgetCategory, string>>;
export function applyPerPersonAllocations(itinerary: Itinerary, value: BudgetAllocations): Itinerary;
```

- [ ] Add `cost_scope?: CostScope` to `ReservationBase` and `allocations?: BudgetAllocations` to `Itinerary["budget"]`.
- [ ] Write a failing conversion test covering a two-person trip with a `¥180/人` train and a `整单 ¥1,200` hotel:

```ts
test("将每人和整单预订统一换算为整团金额", () => {
  const trip = withReservations([
    transport({ cost: 180, cost_scope: "per_person" }),
    stay({ cost: 1200, cost_scope: "total" }),
  ], 2);

  const result = getBudgetOverview(trip);

  expect(category(result, "transport").plannedGroup).toBe(360);
  expect(category(result, "transport").plannedPerPerson).toBe(180);
  expect(category(result, "lodging").plannedGroup).toBe(1200);
  expect(category(result, "lodging").plannedPerPerson).toBe(600);
});
```

- [ ] Run `pnpm --filter web test -- src/lib/itinerary-budget.test.ts` and confirm the module/import failure is the reason it fails.
- [ ] Implement constants, labels, money conversion and legacy cost-scope defaults: old transport is `per_person`; old stay is `total`; use `Math.max(travelers, 1)` only as a calculation guard.
- [ ] Add failing tests for category replacement and fallback:

```ts
test("显式交通费用替代旧估算而不重复相加", () => {
  const trip = withReservations([
    transport({ id: "known", cost: 100, cost_scope: "per_person" }),
    transport({ id: "unknown", cost: undefined }),
    transport({ id: "cancelled", cost: 999, status: "cancelled" }),
  ], 2, { transport: 800 });

  const result = category(getBudgetOverview(trip), "transport");
  expect(result.plannedGroup).toBe(200);
  expect(result.incomplete).toBe(true);
  expect(result.sources.map(source => source.id)).toEqual(["known"]);
});

test("没有任何明确交通费用时沿用旧估算", () => {
  const result = category(getBudgetOverview(
    withReservations([transport({ cost: undefined })], 2, { transport: 800 }),
  ), "transport");
  expect(result.plannedGroup).toBe(800);
  expect(result.incomplete).toBe(true);
  expect(result.sources[0]).toMatchObject({ kind: "estimate", label: "行程生成估算" });
});
```

- [ ] Implement the six-category summary. For food, tickets, local transport and other, create only aggregate estimate sources; never derive source rows from `ItineraryItem.cost`.
- [ ] Add tests for zero versus unknown, cancelled-only reservations, one traveler, multiple travelers, allocation under/over totals, category overspend and formatting-independent decimal arithmetic.
- [ ] Implement validation and application: reject non-finite/negative allocations, multiply valid per-person inputs by the actual traveler count, write only `budget.allocations`, and leave legacy `estimated_total`, `remaining` and category estimate fields unchanged.
- [ ] Run:

```text
pnpm --filter web test -- src/lib/itinerary-budget.test.ts
pnpm --filter web typecheck
```

- [ ] Review the diff and confirm the calculation module has no React, DOM, storage or formatting dependencies.

## Task 2: Normalize old data and reject corrupt new budget fields

**Files:**

- Modify: `apps/web/src/lib/itinerary-reservations.ts`
- Modify: `apps/web/src/lib/itinerary-reservations.test.ts`
- Modify: `apps/web/src/lib/travel-store.ts`
- Modify: `apps/web/src/lib/travel-store.test.ts`

- [ ] Add failing reservation guard tests:

```ts
test("旧预订允许缺少费用口径，新预订只接受两个合法值", () => {
  expect(isTravelReservation(transport({ cost_scope: undefined }))).toBe(true);
  expect(isTravelReservation(transport({ cost_scope: "per_person" }))).toBe(true);
  expect(isTravelReservation({ ...transport(), cost_scope: "hourly" })).toBe(false);
});
```

- [ ] Extend `isTravelReservation` so absent `cost_scope` is compatible and an explicit value must be `per_person` or `total`. Keep existing finite, non-negative cost validation.
- [ ] Add failing storage tests for legacy normalization:

```ts
test("读取旧行程时补出分类额度和预订费用口径", () => {
  const old = legacyTripWithoutBudgetFields();
  localStorage.setItem("travel:last-itinerary", JSON.stringify(old));

  const trip = readTrips()[0];
  expect(trip.budget.allocations).toEqual({
    transport: trip.budget.transport,
    lodging: trip.budget.lodging,
    food: trip.budget.food,
    tickets: trip.budget.tickets,
    local_transport: trip.budget.local_transport,
    other: trip.budget.other ?? 0,
  });
  expect(trip.reservations?.find(item => item.kind === "transport")?.cost_scope).toBe("per_person");
  expect(trip.reservations?.find(item => item.kind === "stay")?.cost_scope).toBe("total");
});
```

- [ ] In `normalizeTrip`, clone and normalize valid reservations with `reservationCostScope`, and derive missing allocations with `defaultBudgetAllocations`.
- [ ] Add a narrow traveler guard: missing legacy `travelers` still defaults to `2`, but an explicit traveler count must be a positive integer. Avoid expanding this task into a complete legacy schema rewrite.
- [ ] Add failing v2 corruption tests for a missing allocation key, negative/NaN-like allocation, illegal cost scope and traveler count `0`. Each test must assert both the thrown read error and exact preservation of `travel:library:v2` raw content.
- [ ] Implement `isBudgetAllocations` and make explicit invalid new fields fail `normalizeTrip`; do not remove invalid records or save a cleaned library.
- [ ] Add a round-trip test that saves a trip with all six allocations and both cost scopes, then reopens it with identical values.
- [ ] Update `getTripReadiness` to calculate recorded reservation cost as a group-total value using `reservationGroupCost`; exclude cancelled/unknown entries and preserve known zero.
- [ ] Update its tests so a two-person `¥180/人` record contributes `¥360`, and a whole-order hotel contributes its unchanged amount.
- [ ] Run:

```text
pnpm --filter web test -- src/lib/itinerary-reservations.test.ts src/lib/travel-store.test.ts src/lib/itinerary-budget.test.ts
pnpm --filter web typecheck
```

- [ ] Review the persisted JSON shape and confirm no library version bump or destructive migration occurs.

## Task 3: Add the reservation cost-scope control and truthful logistics totals

**Files:**

- Modify: `apps/web/src/components/itinerary/reservation-editor.tsx`
- Modify: `apps/web/src/components/itinerary/reservation-editor.test.tsx`
- Modify: `apps/web/src/components/itinerary/travel-logistics.tsx`
- Modify: `apps/web/src/components/itinerary/travel-logistics.test.tsx`

- [ ] Add a failing editor test that changes the labelled `费用口径` combobox from `每人费用` to `整单费用` and expects `cost_scope: "total"` in `onChange`.
- [ ] Render the cost and scope controls as one related field group. The select remains usable when cost is blank; keep blank cost as `undefined`.
- [ ] Update `newTransport()` to start with `cost_scope: "per_person"` and `newStay()` with `cost_scope: "total"`.
- [ ] Add tests confirming the defaults through the Add Transport/Add Stay flows.
- [ ] Add a failing card test that expects `¥180/人` for a per-person transport and `整单 ¥1,200` for a total-scope stay.
- [ ] Update reservation cards to show the cost scope explicitly. Show `¥0/人` or `整单 ¥0` for known zero; omit the amount only when it is undefined.
- [ ] Rename the summary label to `整团已录入预订费用` and replace the obsolete “not counted in budget” helper with copy explaining that the budget tab uses valid costs in place of estimates.
- [ ] Add a test that a cancelled record remains visible but does not affect the group recorded-cost total.
- [ ] Run:

```text
pnpm --filter web test -- src/components/itinerary/reservation-editor.test.tsx src/components/itinerary/travel-logistics.test.tsx
pnpm --filter web typecheck
```

- [ ] Manually inspect labels and tab order in the rendered test DOM; confirm cost scope is announced independently from the amount.

## Task 4: Build the budget summary and controlled allocation editor

**Files:**

- Create: `apps/web/src/components/itinerary/budget-editor.tsx`
- Create: `apps/web/src/components/itinerary/budget-editor.test.tsx`
- Create: `apps/web/src/components/itinerary/travel-budget.tsx`
- Create: `apps/web/src/components/itinerary/travel-budget.test.tsx`

**Component contracts:**

```ts
type BudgetEditorProps = {
  value: BudgetAllocations; // per-person values
  onChange: (value: BudgetAllocations) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

type TravelBudgetProps = {
  itinerary: Itinerary;
  draft: BudgetAllocations | null;
  onStartEdit: () => void;
  onDraftChange: (value: BudgetAllocations) => void;
  onCommit: () => void;
  onCancel: () => void;
};
```

- [ ] Write a failing `BudgetEditor` test that enters a negative value, submits, expects `role="alert"`, focus on the first invalid field and no `onSubmit` call.
- [ ] Build a controlled six-field editor with explicit labels such as `交通预算（每人）`, numeric input mode, `min="0"`, inline error IDs and `aria-describedby`. Parse blank/invalid text locally so transient input does not turn into zero; only emit complete numeric `BudgetAllocations` values.
- [ ] Add editor tests for decimal values, known zero, confirm and cancel keyboard-accessible buttons.
- [ ] Write a failing `TravelBudget` summary test for a two-person trip, asserting primary per-person total/planned/remaining and secondary group totals.
- [ ] Render the top summary from `getBudgetOverview`; use one shared money formatter that displays at most two decimals without rounding stored values.
- [ ] Render six category cards in the fixed domain order. Each card must show allocation, planned spend, remaining/over text and a named progress indicator. Cap visual width at 100%, but expose the real percentage and text when over budget. For a zero allocation with positive spend, show explicit overspend instead of dividing by zero.
- [ ] Use accessible disclosure controls for source rows. Reservation rows may show only title, amount and scope; aggregate categories show `行程生成估算`. Do not render provider, confirmation number, contact or notes.
- [ ] Add source privacy tests that put secret strings in those reservation fields and assert they are absent from the budget DOM.
- [ ] Render non-blocking warnings for unallocated total, allocations above total, each overspent category and incomplete transport/stay costs. Add a neutral empty state when planned total is zero.
- [ ] Add warning tests for under-allocation, over-allocation, category overspend, unknown reservation cost, cancelled exclusion and total budget zero.
- [ ] While `draft` is non-null, show the editor without replacing the latest summary. The parent owns the draft so tab switches cannot erase it.
- [ ] Run:

```text
pnpm --filter web test -- src/components/itinerary/budget-editor.test.tsx src/components/itinerary/travel-budget.test.tsx
pnpm --filter web typecheck
```

- [ ] Review every warning to ensure it uses words/icons in addition to color and that no message prevents confirmation.

## Task 5: Integrate the budget workspace with dirty, undo and save behavior

**Files:**

- Modify: `apps/web/src/components/itinerary/itinerary-view.tsx`
- Modify: `apps/web/src/components/itinerary/itinerary-view.test.tsx`

- [ ] Extend `workspace` to `"schedule" | "logistics" | "budget"` and add a `预算` tab with the same `tablist` semantics.
- [ ] Add parent state `budgetDraft: BudgetAllocations | null`. Start it from `getPerPersonAllocations(current)`, update it through `BudgetEditor`, and preserve it when switching any workspace.
- [ ] Add a failing integration test:

```ts
test("预算草稿跨工作区保留并阻止全局保存", async () => {
  const save = vi.fn();
  render(<ItineraryView itinerary={DEMO_ITINERARY} onSave={save} />);
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  await userEvent.click(screen.getByRole("button", { name: "编辑分类预算" }));
  await userEvent.clear(screen.getByLabelText("交通预算（每人）"));
  await userEvent.type(screen.getByLabelText("交通预算（每人）"), "500");
  await userEvent.click(screen.getByRole("tab", { name: "日程" }));
  await userEvent.click(screen.getByRole("button", { name: "保存行程" }));

  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("请先确认或取消正在编辑的预算");
  await userEvent.click(screen.getByRole("tab", { name: "预算" }));
  expect(screen.getByLabelText("交通预算（每人）")).toHaveValue(500);
});
```

- [ ] Include `budgetDraft !== null` in `hasUnsaved`; reset it only when the itinerary prop changes or the user explicitly confirms/cancels the editor. Do not clear it merely because a tab or day changes.
- [ ] Make global save block on either active editor with a specific actionable message. If both drafts somehow exist, mention both or direct the user to finish open edits; do not save a partial state.
- [ ] On budget confirmation, call `applyPerPersonAllocations(current, budgetDraft)`, pass the result through the existing `commit`, then clear the draft. Do not call `onSave` directly.
- [ ] Add integration tests showing confirmation marks the trip unsaved, global undo restores the previous allocations, save writes allocations to localStorage, refresh/read restores them, and storage failure keeps the current edit visible and dirty.
- [ ] Add a regression test showing confirming a reservation changes the derived transport/lodging planned spend without mutating the saved allocation.
- [ ] Ensure existing reservation-draft behavior remains unchanged and update any exact tab-count assumptions.
- [ ] Run:

```text
pnpm --filter web test -- src/components/itinerary/itinerary-view.test.tsx src/components/itinerary/travel-budget.test.tsx src/lib/travel-store.test.ts
pnpm --filter web typecheck
```

- [ ] Review state transitions for one and only one undo snapshot per confirmed budget edit.

## Task 6: Add responsive styling and update capability documentation

**Files:**

- Modify: `apps/web/src/app/landing.css`
- Modify: `README.md`

- [ ] Add scoped classes for `.travel-budget`, summary cards, category cards, source disclosures, warnings, progress indicators and the editor. Reuse existing CSS variables and button classes.
- [ ] At desktop widths, use a three-column summary and a two-column category/source layout where space allows. Preserve a readable source order and avoid hiding information behind hover-only interactions.
- [ ] At the existing mobile breakpoint, collapse all budget content to one column, make fields/buttons at least 44px high, keep disclosure content directly below its category, and prevent horizontal overflow from long reservation titles or amounts.
- [ ] Add visible `:focus-visible` treatment consistent with existing controls and respect the project’s current reduced-motion rules; this feature should not introduce new motion.
- [ ] Update `README.md` to list pre-trip category allocation, per-person/whole-order reservation costs and reservation-based budget replacement. State clearly that actual spending, booking/payment and cloud sync are not included.
- [ ] Run the full automated gate:

```text
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
```

- [ ] Inspect the resulting diff to confirm changes are limited to the files in this plan and no generated build output is tracked.

## Task 7: Complete real-browser acceptance at desktop and mobile sizes

**Files:**

- Verify only; fix defects in the owning file from Tasks 1–6 and add a regression test beside that code.

- [ ] Start the local application with `pnpm --filter web dev` and record the actual local URL/port.
- [ ] At `1280×800`, open an existing legacy trip and verify the `日程 / 交通住宿 / 预算` tabs, primary per-person summary and secondary group totals.
- [ ] Edit all six allocations, intentionally leave part unallocated, then exceed the total. Confirm both warnings are worded correctly and neither blocks confirmation.
- [ ] Add a per-person transport and a whole-order stay. Confirm the budget source rows and category totals replace the generated transport/lodging estimates instead of adding to them.
- [ ] Leave one active reservation cost blank and cancel another. Confirm the incomplete warning appears and the cancelled record is excluded.
- [ ] Confirm an allocation edit, undo it, save it, refresh and verify the persisted values. Repeat the save with a temporarily simulated storage failure and confirm current values remain visible and dirty.
- [ ] At `390×844`, repeat edit/expand/save flows using touch-sized controls. Check `document.documentElement.scrollWidth <= window.innerWidth` and verify no clipped amount, horizontal scrollbar or overlapping fixed UI.
- [ ] Complete keyboard-only navigation for tabs, disclosure controls, all six fields, confirm and cancel. Confirm first-invalid focus and named progress indicators with the accessibility tree.
- [ ] Check the browser console and page for related exceptions, hydration failures and framework error overlays.
- [ ] After any browser-found fix, rerun its focused test plus:

```text
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
```

- [ ] Stop the local server. Do not deploy to Netlify.

## Final Completion Checklist

- [ ] Every requirement in the approved spec maps to an implementation task or an explicit non-goal.
- [ ] All focused tests, the full suite, typecheck and production build pass.
- [ ] Legacy and corrupt-data tests prove raw v2 storage is never silently rewritten.
- [ ] Desktop and mobile browser acceptance passes with no related console errors.
- [ ] No homepage, external API, deployment or actual-expense work entered the change set.
- [ ] The user receives a concise summary of implemented behavior, verification results and any remaining limitations.
