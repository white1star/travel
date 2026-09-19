# 本地规划引擎 V2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让创建页的兴趣、节奏、必去地点、预算和多城市输入真实影响本地生成结果，并通过“生成预览 → 确认保存”完成可靠闭环。

**Architecture:** 用纯函数地点目录与规则规划器生成 `LocalPlanResult`，用独立预览存储模块恢复未保存结果，再由受控预览组件和现有 `PlannerWizard` 组织生成、返回修改与保存。规划器不访问浏览器、网络或环境变量；创建页本阶段始终使用本地规划器，以后 API 只需替换相同语义的适配器。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library、现有 localStorage 行程库、Playwright CLI。

**Spec:** `docs/superpowers/specs/2026-09-19-local-planner-v2-design.md`

## Global Constraints

- 不接地图、AI、酒店、票务或天气 API；不发出生成网络请求。
- 未知城市和地点只能显示用户输入及“待定位/待完善”，坐标使用 `[0, 0]` 且不写 `location_source`。
- 生成预览不得写入行程库；只有用户明确确认才保存。
- 已知地点只来自当前项目已有的苏州、杭州数据，营业时间统一按未验证处理。
- 预算按整团金额保存，界面可展示人均；六类额度之和必须精确等于总预算。
- 必去地点必须保留并锁定，即使突破节奏容量或门票额度。
- 保留现有行程详情、交通住宿、预算、撤销、回收站和旧数据兼容行为。
- 不改首页，不部署 Netlify，不增加产品依赖。
- 当前目录不是安全的独立 Git 根；不得对 `D:\` 根创建提交。每个任务用项目内 SDD ledger 和通过的测试命令建立检查点。

## Review Focus

- URL 带新建参数但浏览器存在旧预览时：新建参数必须优先并清除旧预览，不能展示上一趟旅行。
- 目的地包含重复、空白或天数少于城市数时：规范化后稳定分配并明确提示未排入城市。
- 必去地点多于每日容量且包含同名目录地点时：只出现一次、保持锁定、允许超量并提示。
- localStorage 在写预览或保存行程时抛错：当前内存中的预览不能消失，按钮必须恢复可用。
- 每人预算为 0 或小数、人数为 20 时：六类整团额度仍有限、非负且总和精确。

---

### Task 1: 建立地点目录和纯函数规划器

**Files:**

- Create: `apps/web/src/lib/local-place-catalog.ts`
- Create: `apps/web/src/lib/local-planner.ts`
- Create: `apps/web/src/lib/local-planner.test.ts`
- Retain until Task 4 migration: `apps/web/src/lib/personalize-itinerary.ts`
- Retain until Task 4 migration: `apps/web/src/lib/personalize-itinerary.test.ts`

**Interfaces:**

- Consumes: `TripDraft`, `Itinerary`, `ItineraryDay`, `ItineraryItem`, `BudgetAllocations` from `apps/web/src/lib/types.ts`.
- Produces:

```ts
export type LocalPlace = {
  id: string;
  city: string;
  name: string;
  category: string;
  interests: string[];
  suggestedDurationMinutes: number;
  estimatedCostPerPerson: number;
  description: string;
  coordinate?: [number, number];
  verifiedHours: false;
};

export type LocalPlanResult = { itinerary: Itinerary; notices: string[] };

export function getLocalPlaces(city: string): LocalPlace[];
export function findLocalPlace(name: string, city?: string): LocalPlace | undefined;
export function createLocalItinerary(
  draft: TripDraft,
  options?: { id?: string; generatedAt?: string },
): LocalPlanResult;
```

- Task 2 stores `LocalPlanResult`; Tasks 3–4 render and create it.

- [ ] **Step 1: Write catalog and planner behavior tests before production code**

Create `local-planner.test.ts` with a complete base draft and focused tests. The assertions must include:

```ts
const base: TripDraft = {
  mode: "known",
  origin: "上海",
  destinations: ["苏州", "杭州"],
  dateMode: "fixed",
  startDate: "2026-11-06",
  days: 4,
  travelers: 2,
  budgetPerPerson: 3000,
  pace: "balanced",
  interests: ["博物馆"],
  requiredPlaces: ["拙政园", "自选咖啡馆"],
  returnToOrigin: true,
};

test("必去地点锁定且未知地点不伪造定位", () => {
  const { itinerary } = createLocalItinerary(base, { id: "fixed", generatedAt: "2026-09-19T00:00:00.000Z" });
  const items = itinerary.days.flatMap(day => day.items);
  expect(items.find(item => item.name === "拙政园")).toMatchObject({ locked: true });
  expect(items.find(item => item.name === "自选咖啡馆")).toMatchObject({
    locked: true,
    coordinate: [0, 0],
    category: "用户必去 · 待定位",
  });
  expect(items.find(item => item.name === "自选咖啡馆")).not.toHaveProperty("location_source");
});

test("兴趣改变普通候选优先级", () => {
  const day = createLocalItinerary({
    ...base,
    destinations: ["苏州"],
    days: 1,
    pace: "compact",
    requiredPlaces: [],
  }).itinerary.days[0];
  expect(day.items[0].name).toBe("苏州博物馆");
  expect(day.items.findIndex(item => item.name === "苏州博物馆")).toBeLessThan(
    day.items.findIndex(item => item.name === "平江路"),
  );
});

test.each([
  ["relaxed", 2],
  ["balanced", 3],
  ["compact", 4],
] as const)("%s 节奏限制每天普通安排容量", (pace, capacity) => {
  const { itinerary } = createLocalItinerary({ ...base, requiredPlaces: [], destinations: ["苏州"], days: 1, pace });
  expect(itinerary.days[0].items).toHaveLength(capacity);
});

test("天数少于城市数时不伪造跨城日程并提示未排入城市", () => {
  const result = createLocalItinerary({ ...base, destinations: ["苏州", "杭州", "成都"], days: 2 });
  expect(result.itinerary.days.map(day => day.city)).toEqual(["苏州", "杭州"]);
  expect(result.itinerary.route).toEqual(["上海", "苏州", "杭州", "成都", "上海"]);
  expect(result.notices.join(" ")).toContain("成都");
});

test("六类额度精确等于整团预算，预算为零时不加入普通付费地点", () => {
  const zero = createLocalItinerary({ ...base, destinations: ["苏州"], days: 1, travelers: 20, budgetPerPerson: 0, requiredPlaces: [] });
  expect(Object.values(zero.itinerary.budget.allocations ?? {}).reduce((sum, value) => sum + value, 0)).toBe(0);
  expect(zero.itinerary.days[0].items.filter(item => item.cost > 0)).toHaveLength(0);
  const decimal = createLocalItinerary({ ...base, travelers: 20, budgetPerPerson: 1234.56 });
  expect(Object.values(decimal.itinerary.budget.allocations ?? {}).reduce((sum, value) => sum + value, 0))
    .toBeCloseTo(24691.2, 8);
});
```

Add these explicit boundary tests in the same file:

```ts
test("固定日期递增而灵活日期保持为空", () => {
  expect(createLocalItinerary(base).itinerary.days.map(day => day.date)).toEqual([
    "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09",
  ]);
  expect(createLocalItinerary({ ...base, dateMode: "flexible" }).itinerary.days.every(day => day.date === null)).toBe(true);
});

test("重复必去地点只排一次，超出节奏容量时全部保留并提示", () => {
  const result = createLocalItinerary({
    ...base,
    destinations: ["成都"],
    days: 1,
    pace: "relaxed",
    requiredPlaces: ["甲", "甲", "乙", "丙"],
  });
  expect(result.itinerary.days[0].items.map(item => item.name)).toEqual(["甲", "乙", "丙"]);
  expect(result.notices.join(" ")).toContain("超过所选节奏");
});

test("目录中已知必去地点进入对应目的城市", () => {
  const result = createLocalItinerary({ ...base, requiredPlaces: ["灵隐寺"] });
  const day = result.itinerary.days.find(value => value.items.some(item => item.name === "灵隐寺"));
  expect(day?.city).toBe("杭州");
  expect(day?.items.find(item => item.name === "灵隐寺")?.locked).toBe(true);
});

test("未知城市不生成虚构地点", () => {
  const result = createLocalItinerary({ ...base, destinations: ["成都"], days: 1, requiredPlaces: [] });
  expect(result.itinerary.days[0]).toMatchObject({ city: "成都", items: [] });
  expect(result.notices.join(" ")).toContain("待完善");
});

test("固定标识与时间时结果稳定，并使用明确的本地估算公式", () => {
  const options = { id: "fixed", generatedAt: "2026-09-19T00:00:00.000Z" };
  const first = createLocalItinerary(base, options).itinerary;
  const second = createLocalItinerary(base, options).itinerary;
  expect(second).toEqual(first);
  expect(first.route).toEqual(["上海", "苏州", "杭州", "上海"]);
  expect(first.budget.transport).toBe(720);
  expect(first.budget.lodging).toBe(1080);
  expect(first.budget.food).toBe(960);
  expect(first.budget.local_transport).toBe(320);
  expect(first.budget.tickets).toBe(
    first.days.flatMap(day => day.items).reduce((sum, item) => sum + item.cost * 2, 0),
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `pnpm --dir apps/web test src/lib/local-planner.test.ts`

Expected: FAIL because `./local-planner` does not exist.

- [ ] **Step 3: Implement the fixed local catalog**

Populate `local-place-catalog.ts` from the existing demo items only:

- 苏州：拙政园、苏州博物馆、平江路、留园、山塘街；
- 杭州：西湖、中国丝绸博物馆、灵隐寺。

Set all `verifiedHours` values to `false`. Assign interests exactly from the existing UI vocabulary. Return cloned arrays from `getLocalPlaces` so planner sorting cannot mutate the catalog. `findLocalPlace` trims the name and optionally restricts city; it performs exact locale-aware name matching and never fuzzy-guesses.

- [ ] **Step 4: Implement `createLocalItinerary` as a pure deterministic pipeline**

Use focused internal helpers with these exact responsibilities:

```ts
const CAPACITY = { relaxed: 2, balanced: 3, compact: 4 } as const;
const INTENSITY = { relaxed: "轻松", balanced: "适中", compact: "紧凑" } as const;

function allocateCities(destinations: string[], days: number): { cities: string[]; omitted: string[] };
function allocateBudget(total: number): BudgetAllocations;
function scheduleItems(day: ItineraryDay, places: LocalPlace[], required: ItineraryItem[], ticketLimit: number): ItineraryItem[];
function planningBudget(draft: TripDraft, days: ItineraryDay[], route: string[]): Itinerary["budget"];
```

`allocateCities` gives each included city one day, then distributes remaining days round-robin from the first city. `allocateBudget` rounds each of the first five category values to cents and assigns the exact remainder to `other`. Candidate sorting uses number of interest matches descending then catalog order. Paid ordinary candidates are skipped when their group ticket cost would exceed the ticket allocation; free candidates remain eligible. Required items are placed before candidates and may exceed capacity or allocation.

Schedule from 09:00, add duration, then 30 minutes. Do not add ordinary candidates whose end would exceed 19:00. Unknown-city days may have an empty `items` array. Known catalog coordinates may be preserved, but do not claim verified hours or add `location_source`.

Use the spec formulas for planned costs and set:

```ts
estimated_total = transport + lodging + food + tickets + local_transport + other;
remaining = total_available - estimated_total;
data_notice = "本行程由本地规则生成；地点开放时间、票价和交通需在出发前确认。";
```

- [ ] **Step 5: Run planner tests, then full regression and typecheck**

Run:

```text
pnpm --dir apps/web test src/lib/local-planner.test.ts
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: local planner tests PASS; full suite PASS; typecheck exit 0.

- [ ] **Step 6: Record Task 1 checkpoint**

Append exact commands and pass counts to `.superpowers/sdd/2026-09-19-local-planner-v2/progress.md`. Do not create a Git commit in the current non-independent repository.

### Task 2: Add validated preview persistence

**Files:**

- Create: `apps/web/src/lib/planner-preview-store.ts`
- Create: `apps/web/src/lib/planner-preview-store.test.ts`

**Interfaces:**

- Consumes: `LocalPlanResult` from Task 1, `TripDraft` and `Itinerary`.
- Produces:

```ts
export const PLANNER_DRAFT_KEY = "travel:planner-draft:v1";
export const PLANNER_PREVIEW_KEY = "travel:planner-preview:v1";

export type PlannerDraftRecord = {
  version: 1;
  draft: TripDraft;
  destinationText: string;
  requiredText: string;
  step: 0 | 1 | 2;
};

export type PlannerPreviewRecord = {
  version: 1;
  draft: TripDraft;
  itinerary: Itinerary;
  notices: string[];
};

export function readPlannerDraft(storage?: Storage): PlannerDraftRecord | null;
export function writePlannerDraft(value: PlannerDraftRecord, storage?: Storage): void;
export function clearPlannerDraft(storage?: Storage): void;
export function readPlannerPreview(storage?: Storage): PlannerPreviewRecord | null;
export function writePlannerPreview(value: PlannerPreviewRecord, storage?: Storage): void;
export function clearPlannerPreview(storage?: Storage): void;
```

- Task 4 is the only UI consumer. Store functions throw on writes so the UI can report unavailable persistence; reads return `null` for absent records and throw `Error("创建数据无法读取")` for malformed present records.

- [ ] **Step 1: Write store tests**

Test draft/preview round-trip, absent records, wrong version, invalid enum/number/array values, an itinerary missing `id`, non-string notices, and a failing `Storage.setItem`. Include:

```ts
test.each([
  { version: 1, draft: {}, itinerary: {}, notices: [] },
  { ...previewRecord, itinerary: { ...previewRecord.itinerary, id: "" } },
  { ...previewRecord, notices: ["可读提示", 3] },
])("损坏预览被拒绝且不影响行程库键 %#", value => {
  localStorage.setItem(PLANNER_PREVIEW_KEY, JSON.stringify(value));
  localStorage.setItem("travel:library:v2", "existing-library");
  expect(() => readPlannerPreview()).toThrow("创建数据无法读取");
  expect(localStorage.getItem("travel:library:v2")).toBe("existing-library");
});

test("草稿和预览可往返且使用互不覆盖的键", () => {
  writePlannerDraft(draftRecord);
  writePlannerPreview(previewRecord);
  expect(readPlannerDraft()).toEqual(draftRecord);
  expect(readPlannerPreview()).toEqual(previewRecord);
  clearPlannerPreview();
  expect(readPlannerPreview()).toBeNull();
  expect(readPlannerDraft()).toEqual(draftRecord);
});

test.each([
  { version: 2, draft: draftRecord.draft, destinationText: "苏州", requiredText: "", step: 0 },
  { ...draftRecord, step: 3 },
  { ...draftRecord, draft: { ...draftRecord.draft, pace: "fast" } },
  { ...draftRecord, draft: { ...draftRecord.draft, travelers: 0 } },
])("拒绝无效草稿 %#", value => {
  localStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(value));
  expect(() => readPlannerDraft()).toThrow("创建数据无法读取");
});

test("写入失败向调用方抛错且不宣告持久化成功", () => {
  const failing: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    getItem: () => null,
    removeItem: () => {},
    setItem: () => { throw new Error("quota"); },
  };
  expect(() => writePlannerPreview(previewRecord, failing)).toThrow("quota");
});
```

- [ ] **Step 2: Run store tests and verify RED**

Run: `pnpm --dir apps/web test src/lib/planner-preview-store.test.ts`

Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement validation and storage operations**

Keep validation local to this module. Validate every `TripDraft` enum, string array, finite number and boolean. Validate preview itinerary core fields (`id`, `title`, positive integer `travelers`, `route`, `days`, finite budget totals and `generated_at`) plus `notices: string[]`. Do not import or expose `travel-store.ts` internals and never rewrite malformed raw records.

- [ ] **Step 4: Verify store and regression tests**

Run:

```text
pnpm --dir apps/web test src/lib/planner-preview-store.test.ts
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Record Task 2 checkpoint**

Append commands and pass counts to the plan ledger; no Git commit.

### Task 3: Build the itinerary preview component

**Files:**

- Create: `apps/web/src/components/planner/itinerary-preview.tsx`
- Create: `apps/web/src/components/planner/itinerary-preview.test.tsx`

**Interfaces:**

- Consumes: `PlannerPreviewRecord` from Task 2 and existing money/budget types.
- Produces:

```ts
type ItineraryPreviewProps = {
  value: PlannerPreviewRecord;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
};

export function ItineraryPreview(props: ItineraryPreviewProps): React.ReactElement;
```

- Task 4 renders it and owns persistence/navigation.

- [ ] **Step 1: Write component tests before JSX**

Build one fixture using `createLocalItinerary`. Assert route, date/day count, group and per-person budget, every day heading, required marker, pending-location marker, notices, and six allocation labels. Assert callbacks and saving state:

```ts
test("预览提供返回修改和单次确认保存入口", async () => {
  const onBack = vi.fn();
  const onSave = vi.fn();
  const { rerender } = render(<ItineraryPreview value={record} saving={false} onBack={onBack} onSave={onSave} />);
  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  await userEvent.click(screen.getByRole("button", { name: "确认保存行程" }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(onSave).toHaveBeenCalledOnce();
  rerender(<ItineraryPreview value={record} saving onBack={onBack} onSave={onSave} />);
  expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
});
```

Add this rendering boundary test:

```ts
test("未知城市展示待完善空状态且不泄露内部定位数据", () => {
  render(<ItineraryPreview value={unknownCityRecord} saving={false} onBack={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByText("当天地点待完善")).toBeInTheDocument();
  expect(screen.getByText(/待定位|待完善/)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("[0,0]");
  expect(document.body).not.toHaveTextContent("120.6295");
  expect(document.body).not.toHaveTextContent(unknownCityRecord.itinerary.id);
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm --dir apps/web test src/components/planner/itinerary-preview.test.tsx`

Expected: FAIL because `./itinerary-preview` does not exist.

- [ ] **Step 3: Implement semantic, responsive-ready preview markup**

Use a `main`-level section with `aria-label="行程预览"`. Render:

- heading “先看看这份行程”；
- summary definition list for route, dates, people, per-person/group budget;
- `role="status"` notice list when non-empty;
- one day `<article>` per day with ordered item list;
- visible text badges “必去”“待定位”“开放时间待确认”；
- a six-category budget list based on `budget.allocations` in fixed category order;
- bottom action row with “返回修改”和“确认保存行程”.

Do not copy the full itinerary editor into this component and do not expose internal coordinates.

- [ ] **Step 4: Verify component, full suite and typecheck**

Run:

```text
pnpm --dir apps/web test src/components/planner/itinerary-preview.test.tsx
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Record Task 3 checkpoint**

Append commands and pass counts to the plan ledger; no Git commit.

### Task 4: Integrate generation, recovery and save into PlannerWizard

**Files:**

- Modify: `apps/web/src/components/planner/planner-wizard.tsx`
- Modify: `apps/web/src/components/planner/planner-wizard.test.tsx`
- Delete: `apps/web/src/lib/personalize-itinerary.ts`
- Delete: `apps/web/src/lib/personalize-itinerary.test.ts`

**Interfaces:**

- Consumes: `createLocalItinerary`, planner draft/preview store functions, `ItineraryPreview`, and existing `saveTrip`.
- Produces:

```ts
type PlannerWizardProps = {
  onSave?: (itinerary: Itinerary) => void;
  navigate?: (href: string) => void;
};

export function PlannerWizard({
  onSave = saveTrip,
  navigate = href => window.location.assign(href),
}: PlannerWizardProps): React.ReactElement;
```

- No API base resolver or generation fetch remains in the creation flow.

- [ ] **Step 1: Replace obsolete API test with failing preview/save integration tests**

Remove the `getPlannerApiBase` test. Add tests that prove generation does not save, confirmation saves once, back editing invalidates the old preview, refresh restores valid preview, corrupt preview falls back safely, and save failure retains preview. Include:

```ts
test("生成只创建预览，确认后才保存并进入详情", async () => {
  const save = vi.fn();
  const navigate = vi.fn();
  render(<PlannerWizard onSave={save} navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "生成行程预览" }));
  expect(await screen.findByRole("region", { name: "行程预览" })).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  await userEvent.dblClick(screen.getByRole("button", { name: "确认保存行程" }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("/trips/demo");
});

test("保存失败保留预览并允许重试", async () => {
  const save = vi.fn().mockImplementationOnce(() => { throw new Error("quota"); });
  render(<PlannerWizard onSave={save} navigate={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "生成行程预览" }));
  await userEvent.click(screen.getByRole("button", { name: "确认保存行程" }));
  expect(screen.getByRole("alert")).toHaveTextContent("未保存");
  expect(screen.getByRole("region", { name: "行程预览" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认保存行程" })).toBeEnabled();
});
```

Add the Review Focus case: seed an old preview, load `/plan/new?destination=成都&days=2`, expect the form with 成都 rather than the old preview and expect `PLANNER_PREVIEW_KEY` removed.

```ts
test("带新建参数进入时丢弃旧预览并优先使用参数", async () => {
  writePlannerPreview(oldPreview);
  window.history.replaceState(null, "", "/plan/new?destination=%E6%88%90%E9%83%BD&days=2");
  render(<PlannerWizard />);
  expect(await screen.findByRole("textbox", { name: "目的城市" })).toHaveValue("成都");
  expect(screen.getByRole("spinbutton", { name: "旅行天数" })).toHaveValue(2);
  expect(screen.queryByRole("region", { name: "行程预览" })).not.toBeInTheDocument();
  expect(localStorage.getItem(PLANNER_PREVIEW_KEY)).toBeNull();
});

test("刷新恢复生成预览，返回修改会清除旧预览但保留输入", async () => {
  const first = render(<PlannerWizard />);
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "生成行程预览" }));
  first.unmount();
  render(<PlannerWizard />);
  expect(await screen.findByRole("region", { name: "行程预览" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  expect(screen.getByRole("textbox", { name: "目的城市" })).toHaveValue("苏州、杭州");
  expect(localStorage.getItem(PLANNER_PREVIEW_KEY)).toBeNull();
});

test("损坏预览不会覆盖可恢复草稿", async () => {
  localStorage.setItem(PLANNER_PREVIEW_KEY, "{broken");
  writePlannerDraft(savedDraft);
  render(<PlannerWizard />);
  expect(await screen.findByRole("textbox", { name: "目的城市" })).toHaveValue(savedDraft.destinationText);
  expect(screen.getByRole("status")).toHaveTextContent("预览无法恢复");
});

test("目的地输入去空去重后再生成", async () => {
  render(<PlannerWizard />);
  await userEvent.clear(screen.getByRole("textbox", { name: "目的城市" }));
  await userEvent.type(screen.getByRole("textbox", { name: "目的城市" }), " 苏州、、杭州，苏州 ");
  await userEvent.click(screen.getByRole("button", { name: "直接确认" }));
  await userEvent.click(screen.getByRole("button", { name: "生成行程预览" }));
  const preview = screen.getByRole("region", { name: "行程预览" });
  expect(within(preview).getByText("南京 → 苏州 → 杭州 → 南京")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run wizard tests and verify RED**

Run: `pnpm --dir apps/web test src/components/planner/planner-wizard.test.tsx`

Expected: FAIL because current generation saves immediately, button copy differs, and `PlannerWizard` does not accept injected callbacks.

- [ ] **Step 3: Extract storage use and implement preview-first state flow**

Replace the local `DRAFT_KEY` and inline draft guard with Task 2 functions. Add `preview`, `saving`, and persistence-warning state. Mount behavior in this exact order:

1. parse URL quick-plan parameters;
2. if any valid quick-plan parameter exists, clear stale preview and show the form with URL values over recovered draft;
3. otherwise try valid preview first and show it;
4. if no preview, restore valid draft and step;
5. on malformed preview/draft, keep the usable counterpart and show a non-destructive recovery warning.

`generate` normalizes destination/required text, calls `createLocalItinerary`, stores `PlannerPreviewRecord`, and shows it without calling `onSave`. If preview storage fails, keep the in-memory preview and warn that refresh recovery is unavailable.

`backToEdit` clears preview state and preview storage, restores preference step 1, and preserves draft inputs. `confirmSave` sets `saving` synchronously before awaiting a microtask, calls `onSave` once, clears both caches only after success, then navigates. Guard with a ref as well as disabled state so double-clicks cannot submit twice.

- [ ] **Step 4: Update copy and remove obsolete generation API code**

Change the confirmation heading to “确认后生成预览”, the CTA to “生成行程预览”, and the explanatory copy to state that interests, pace, required places and budget affect the local plan. Remove `getPlannerApiBase`, `requestItinerary`, `fetch`, API failure copy and the obsolete `personalizeDemoItinerary` module/tests after all imports are gone.

Reset must clear both draft and preview caches. A successfully saved preview must clear both caches; a failed save clears neither.

- [ ] **Step 5: Verify wizard integration and all regressions**

Run:

```text
pnpm --dir apps/web test src/components/planner/planner-wizard.test.tsx src/lib/planner-preview-store.test.ts src/lib/local-planner.test.ts
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: all commands exit 0; no test expects generation-time network access.

- [ ] **Step 6: Record Task 4 checkpoint**

Append commands and pass counts to the plan ledger; no Git commit.

### Task 5: Style, document and run real-browser acceptance

**Files:**

- Modify: `apps/web/src/app/landing.css`
- Modify: `README.md`
- Verify: `apps/web/src/app/plan/new/page.tsx`

**Interfaces:**

- Consumes: class names from `ItineraryPreview` and `PlannerWizard`.
- Produces: final responsive preview layout and documented product boundary; no new TypeScript API.

- [ ] **Step 1: Add scoped preview styles**

Add `.planner-preview` scoped styles using existing CSS variables. Desktop `min-width: 900px` uses a two-column layout with the day list as the flexible main column and a `minmax(280px, 340px)` sticky summary column. At the existing mobile breakpoint collapse to one column and remove sticky positioning.

Provide styles for summary, notice list, day cards, item timeline, status badges, budget rows and action bar. Ensure buttons/controls are at least 44px on mobile, long names use `overflow-wrap: anywhere`, focus remains visible, and no horizontal overflow is introduced. Do not add gradients or continuous animation.

- [ ] **Step 2: Update README capability truthfully**

Replace “演示地点和费用” creation language with: local rule planning for Suzhou/Hangzhou, input-driven interests/pace/required places/budget, preview before save, and unknown locations kept as pending. Preserve the statement that real place coverage, routes, prices, accounts and cloud sync require later services.

- [ ] **Step 3: Run the complete automated gate**

Run:

```text
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
```

Expected: all test files and tests PASS, typecheck exit 0, Next production build exit 0 with `/plan/new`, `/trips`, and `/trips/demo` generated.

- [ ] **Step 4: Complete desktop browser acceptance at 1280×800**

Using Playwright against the existing local dev server or a newly started one:

1. create a four-day 苏州、杭州 trip with 博物馆 interest, relaxed pace, required 拙政园 and an unknown required place;
2. verify preview appears without a new trip in `/trips` storage;
3. verify required/unknown badges, day density, route and six budget categories;
4. return, change interest and pace, regenerate, and verify ordering/density changes;
5. refresh and verify preview recovery;
6. confirm save once, verify navigation and exactly one matching trip in 我的行程;
7. open saved trip and verify 日程、交通住宿、预算 tabs still work.

- [ ] **Step 5: Complete mobile and error acceptance at 390×844**

Repeat generation, preview scroll, return and save. Evaluate:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Expected: `true`. Verify all primary controls are usable, long required-place names wrap, no fixed UI overlaps actions, and browser console has no related errors, warnings, hydration failures or framework overlay.

Use automated component tests for injected save failure and storage failure; do not mutate or delete the user’s actual browser library to simulate them.

- [ ] **Step 6: Final review and checkpoint**

Review every spec requirement against Tasks 1–5, scan changed files for accidental API/homepage/deployment work, and record the final gate plus browser evidence in the ledger. Because multi-agent delegation is not authorized, use a separate self-review pass following the code-reviewer rubric and explicitly record that limitation.

Do not deploy and do not stop a development server that was already running before this plan.
