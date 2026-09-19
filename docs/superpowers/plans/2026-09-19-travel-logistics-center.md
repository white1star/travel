# 交通与住宿中心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不接外部 API 的前提下，为每份行程增加可编辑、可检查、可持久化的交通与住宿中心。

**Architecture:** `Itinerary` 增加可选的判别联合预订数组；所有校验、排序、准备度和冲突检查放入独立纯函数。`ItineraryView` 仍是可编辑行程的唯一状态所有者，交通住宿组件只通过回调提交不可变的新行程，因此现有撤销、未保存提醒和原子存储继续生效。

**Tech Stack:** Next.js 16.3.5、React 19.3、TypeScript 5.9、Vitest 5、Testing Library、现有 CSS；不增加依赖。

**Spec:** `docs/superpowers/specs/2026-09-19-travel-logistics-center-design.md`

## Global Constraints

- 首页、地图 API、账号系统和部署不在本次范围。
- 不接搜索、比价、预订、支付、航班动态、邮箱导入或附件上传。
- 不采集身份证、护照、完整乘客姓名或支付信息。
- 费用留空表示未知，明确的 `0` 表示无需费用；不把录入费用冒充实时价格。
- 日期时间按用户看到的当地时间存储为 `YYYY-MM-DDTHH:mm`，不做跨时区换算。
- 预订费用只显示独立小计，不写回现有预算分类。
- 修改必须复用现有撤销、未保存、失败保留和重试保存机制。
- 桌面验收尺寸为 1280×800，移动端为 390×844；移动操作目标至少 44px。
- 当前目录属于 `D:\` 的磁盘级 Git 仓库。不得在当前工作区执行提交；每个任务以测试与只读审查作为检查点。只有迁移到独立仓库后，才可按任务范围创建提交。

---

### Task 1: 预订类型、校验与不可变编辑函数

**Files:**
- Modify: `apps/web/src/lib/types.ts:47`
- Create: `apps/web/src/lib/itinerary-reservations.ts`
- Create: `apps/web/src/lib/itinerary-reservations.test.ts`

**Interfaces:**
- Consumes: 现有 `Itinerary`。
- Produces: `TravelReservation`、`TransportReservation`、`StayReservation`、`validateReservation()`、`upsertReservation()`、`removeReservation()`、`sortReservations()`。

- [ ] **Step 1: 写类型和校验的失败测试**

```ts
import { expect, test } from "vitest";
import { DEMO_ITINERARY } from "./demo-itinerary";
import {
  removeReservation,
  sortReservations,
  upsertReservation,
  validateReservation,
} from "./itinerary-reservations";
import type { StayReservation, TransportReservation, TravelReservation } from "./types";
import { useState } from "react";

const train: TransportReservation = {
  id: "train-1", kind: "transport", mode: "train", status: "confirmed",
  title: "南京到苏州", departure_at: "2026-10-02T08:00",
  arrival_at: "2026-10-02T09:35", departure_place: "南京南站",
  arrival_place: "苏州站", cost: 180,
};
const stay: StayReservation = {
  id: "stay-1", kind: "stay", stay_type: "hotel", status: "planned",
  title: "苏州酒店", check_in_date: "2026-10-02", check_out_date: "2026-10-04",
};

test("校验倒序时间、空地点和住宿退房日期", () => {
  expect(validateReservation({ ...train, arrival_at: "2026-10-02T07:00", arrival_place: "" })).toMatchObject({
    arrival_at: expect.any(String), arrival_place: expect.any(String),
  });
  expect(validateReservation({ ...stay, check_out_date: "2026-10-02" })).toHaveProperty("check_out_date");
  expect(validateReservation(train)).toEqual({});
  expect(validateReservation({ ...stay, check_in_date: "2026-02-30" })).toHaveProperty("check_in_date");
});

test("新增、更新和删除预订不修改原行程", () => {
  const original = { ...DEMO_ITINERARY, reservations: [] };
  const added = upsertReservation(original, train);
  const updated = upsertReservation(added, { ...train, title: "更新车次" });
  expect(original.reservations).toEqual([]);
  expect(updated.reservations).toHaveLength(1);
  expect(updated.reservations?.[0].title).toBe("更新车次");
  expect(removeReservation(updated, "train-1").reservations).toEqual([]);
});

test("按实际发生时间稳定排序且保留取消记录", () => {
  expect(sortReservations([{ ...stay, id: "late", check_in_date: "2026-10-04" }, train, stay]).map(value => value.id))
    .toEqual(["train-1", "stay-1", "late"]);
});
```

- [ ] **Step 2: 运行测试并确认因模块和类型不存在而失败**

Run: `npm.cmd test -- src/lib/itinerary-reservations.test.ts`（工作目录 `apps/web`）  
Expected: FAIL，提示无法解析 `./itinerary-reservations` 或导出类型不存在。

- [ ] **Step 3: 增加实际类型**

在 `types.ts` 增加以下定义，并在 `Itinerary` 中增加 `reservations?: TravelReservation[]`：

```ts
export type BookingStatus = "planned" | "confirmed" | "cancelled";
export type TransportMode = "flight" | "train" | "coach" | "ferry" | "drive" | "other";
export type StayType = "hotel" | "homestay" | "hostel" | "friends" | "other";

export interface TransportReservation {
  id: string; kind: "transport"; mode: TransportMode; status: BookingStatus;
  title: string; departure_at: string; arrival_at: string;
  departure_place: string; arrival_place: string;
  provider?: string; service_number?: string; confirmation_code?: string;
  cost?: number; notes?: string;
}

export interface StayReservation {
  id: string; kind: "stay"; stay_type: StayType; status: BookingStatus;
  title: string; check_in_date: string; check_out_date: string;
  address?: string; contact?: string; confirmation_code?: string;
  cost?: number; notes?: string;
}

export type TravelReservation = TransportReservation | StayReservation;
```

- [ ] **Step 4: 实现纯函数的最小版本**

```ts
import type { Itinerary, TravelReservation } from "./types";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validDateTime(value: string) {
  return LOCAL_DATETIME.test(value) && validDate(value.slice(0, 10));
}

export function validateReservation(value: TravelReservation): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!value.title.trim()) errors.title = "请填写名称。";
  if (value.title.trim().length > 80) errors.title = "名称不能超过 80 个字。";
  if (value.notes && value.notes.length > 500) errors.notes = "备注不能超过 500 个字。";
  if (value.confirmation_code && value.confirmation_code.length > 80) errors.confirmation_code = "预订编号不能超过 80 个字。";
  if (value.cost !== undefined && (!Number.isFinite(value.cost) || value.cost < 0)) errors.cost = "费用不能小于 0。";
  if (value.kind === "transport") {
    if (!value.departure_place.trim()) errors.departure_place = "请填写出发地点。";
    if (!value.arrival_place.trim()) errors.arrival_place = "请填写到达地点。";
    if (value.departure_place.length > 120) errors.departure_place = "出发地点不能超过 120 个字。";
    if (value.arrival_place.length > 120) errors.arrival_place = "到达地点不能超过 120 个字。";
    if (!validDateTime(value.departure_at)) errors.departure_at = "请选择有效的出发时间。";
    if (!validDateTime(value.arrival_at) || value.arrival_at <= value.departure_at) errors.arrival_at = "到达时间必须晚于出发时间。";
  } else {
    if (!validDate(value.check_in_date)) errors.check_in_date = "请选择有效的入住日期。";
    if (!validDate(value.check_out_date) || value.check_out_date <= value.check_in_date) errors.check_out_date = "退房日期必须晚于入住日期。";
    if (value.address && value.address.length > 160) errors.address = "地址不能超过 160 个字。";
    if (value.contact && value.contact.length > 80) errors.contact = "联系电话不能超过 80 个字。";
  }
  return errors;
}

export function upsertReservation(itinerary: Itinerary, reservation: TravelReservation): Itinerary {
  const current = itinerary.reservations ?? [];
  return { ...itinerary, reservations: [reservation, ...current.filter(value => value.id !== reservation.id)] };
}

export function removeReservation(itinerary: Itinerary, id: string): Itinerary {
  return { ...itinerary, reservations: (itinerary.reservations ?? []).filter(value => value.id !== id) };
}

export function sortReservations(values: TravelReservation[]): TravelReservation[] {
  return values.map((value, index) => ({ value, index })).sort((a, b) => {
    const left = a.value.kind === "transport" ? a.value.departure_at : `${a.value.check_in_date}T15:00`;
    const right = b.value.kind === "transport" ? b.value.departure_at : `${b.value.check_in_date}T15:00`;
    return left.localeCompare(right) || a.index - b.index;
  }).map(entry => entry.value);
}
```

- [ ] **Step 5: 运行测试、类型检查并记录检查点**

Run: `npm.cmd test -- src/lib/itinerary-reservations.test.ts`  
Expected: PASS。  
Run: `npm.cmd run typecheck`  
Expected: exit 0。当前工作区不提交；保存测试输出供任务审查。

---

### Task 2: 准备度、住宿覆盖与冲突检查

**Files:**
- Modify: `apps/web/src/lib/itinerary-reservations.ts`
- Modify: `apps/web/src/lib/itinerary-reservations.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TravelReservation` 与 `Itinerary`。
- Produces: `TripReadiness`、`ReservationIssue`、`getTripReadiness(itinerary)`、`findReservationIssues(itinerary)`。

- [ ] **Step 1: 写准备度和冲突的失败测试**

```ts
test("计算住宿夜晚覆盖、待确认数量和明确费用", () => {
  const trip = { ...DEMO_ITINERARY, reservations: [train, stay] };
  expect(getTripReadiness(trip)).toEqual({
    confirmed: 1, planned: 1, coveredNights: 2, totalNights: 3, recordedCost: 180,
  });
  expect(findReservationIssues(trip).map(issue => issue.code)).toContain("missing-stay");
});

test("取消记录不进入统计、覆盖或冲突", () => {
  const cancelled = { ...stay, status: "cancelled" as const };
  expect(getTripReadiness({ ...DEMO_ITINERARY, reservations: [cancelled] }).coveredNights).toBe(0);
});

test("只报告同日真实时间重叠，允许跨午夜交通", () => {
  const overlap = { ...train, departure_at: "2026-10-02T10:15", arrival_at: "2026-10-02T11:00" };
  const overnight = { ...train, id: "night", departure_at: "2026-10-01T23:00", arrival_at: "2026-10-02T07:00" };
  const codes = findReservationIssues({ ...DEMO_ITINERARY, reservations: [overlap, overnight] }).map(value => value.code);
  expect(codes).toContain("activity-conflict");
  expect(codes).not.toContain("invalid-time");
});
```

- [ ] **Step 2: 运行测试并确认缺少导出导致失败**

Run: `npm.cmd test -- src/lib/itinerary-reservations.test.ts`  
Expected: FAIL，提示 `getTripReadiness` / `findReservationIssues` 未导出。

- [ ] **Step 3: 实现不落库的派生计算**

```ts
export interface TripReadiness {
  confirmed: number; planned: number; coveredNights: number;
  totalNights: number; recordedCost: number;
}
export interface ReservationIssue {
  code: "missing-stay" | "activity-conflict" | "outside-trip";
  message: string; reservationId?: string; date?: string;
}

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const limit = new Date(`${end}T00:00:00Z`);
  while (cursor < limit) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}

export function getTripReadiness(itinerary: Itinerary): TripReadiness {
  const active = (itinerary.reservations ?? []).filter(value => value.status !== "cancelled");
  const nights = itinerary.days[0]?.date && itinerary.days.at(-1)?.date
    ? dateRange(itinerary.days[0].date!, itinerary.days.at(-1)!.date!) : [];
  const covered = new Set<string>();
  for (const value of active) if (value.kind === "stay") {
    for (const date of dateRange(value.check_in_date, value.check_out_date)) if (nights.includes(date)) covered.add(date);
  }
  return {
    confirmed: active.filter(value => value.status === "confirmed").length,
    planned: active.filter(value => value.status === "planned").length,
    coveredNights: covered.size, totalNights: nights.length,
    recordedCost: active.reduce((sum, value) => sum + (value.cost ?? 0), 0),
  };
}
```

在同一文件实现 `findReservationIssues`：

```ts
export function findReservationIssues(itinerary: Itinerary): ReservationIssue[] {
  const issues: ReservationIssue[] = [];
  const active = (itinerary.reservations ?? []).filter(value => value.status !== "cancelled");
  const first = itinerary.days[0]?.date;
  const last = itinerary.days.at(-1)?.date;
  if (first && last) {
    const expected = dateRange(first, last);
    const stays = active.filter((value): value is StayReservation => value.kind === "stay");
    for (const date of expected) if (!stays.some(value => value.check_in_date <= date && date < value.check_out_date)) {
      issues.push({ code: "missing-stay", date, message: `${date} 晚尚未记录住宿安排。` });
    }
  }
  for (const value of active) if (value.kind === "transport") {
    for (const day of itinerary.days) if (day.date === value.departure_at.slice(0, 10)) {
      for (const item of day.items) {
        const start = `${day.date}T${item.time}`;
        const end = `${day.date}T${item.end_time}`;
        if (value.departure_at < end && value.arrival_at > start) issues.push({
          code: "activity-conflict", reservationId: value.id, date: day.date,
          message: `${value.title} 与 ${item.name} 的时间重叠。`,
        });
      }
    }
  }
  return issues;
}
```

在 `if (first && last)` 中补齐 `outside-trip`。复用一个 UTC 加一天函数，交通比较到达与出发，住宿比较退房与入住：

```ts
const addDay = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};
const tripStart = `${first}T00:00`;
const tripEnd = `${addDay(last)}T00:00`;
for (const value of active) {
  const outside = value.kind === "transport"
    ? value.arrival_at < tripStart || value.departure_at >= tripEnd
    : value.check_out_date <= first || value.check_in_date >= addDay(last);
  if (outside) issues.push({
    code: "outside-trip", reservationId: value.id,
    message: `${value.title} 的日期不在本次旅行范围内。`,
  });
}
```

这段比较不会把前一晚出发、首日到达或末日出发、次日到达误判。

- [ ] **Step 4: 运行纯函数测试和完整前端回归**

Run: `npm.cmd test -- src/lib/itinerary-reservations.test.ts`  
Expected: PASS。  
Run: `npm.cmd test`  
Expected: 现有 75 项与新增测试全部 PASS。

- [ ] **Step 5: 只读审查派生规则并记录检查点**

逐项对照设计文档第 5 节，确认取消记录、灵活日期、跨午夜和旅行边界均有字面测试；当前工作区不提交。

---

### Task 3: 本地存储兼容与损坏数据保护

**Files:**
- Modify: `apps/web/src/lib/travel-store.ts:11-57`
- Modify: `apps/web/src/lib/travel-store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TravelReservation` 结构。
- Produces: 旧行程统一读取为 `reservations: []`；存在的预订数组必须全量合法，否则保留原始数据并抛出读取错误。

- [ ] **Step 1: 写兼容与损坏保护的失败测试**

```ts
test("旧行程缺少预订字段时读取为空数组并可再次保存", () => {
  localStorage.setItem("travel:last-itinerary", JSON.stringify(DEMO_ITINERARY));
  expect(readTrips()[0].reservations).toEqual([]);
  saveTrip(readTrips()[0]);
  expect(readSelectedTrip()?.reservations).toEqual([]);
});

test("非法预订记录不会被过滤后静默覆盖", () => {
  localStorage.setItem("travel:library:v2", JSON.stringify({
    version: 2,
    trips: [{ ...DEMO_ITINERARY, reservations: [{ id: "broken", kind: "transport" }] }],
    trash: [], selectedId: DEMO_ITINERARY.id,
  }));
  expect(() => readTrips()).toThrow("行程数据无法读取");
  expect(localStorage.getItem("travel:library:v2")).toContain('"id":"broken"');
});
```

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `npm.cmd test -- src/lib/travel-store.test.ts`  
Expected: 第一项读到 `undefined` 或第二项未抛错。

- [ ] **Step 3: 实现结构守卫并接入 normalizeTrip**

在 `itinerary-reservations.ts` 导出：

```ts
export function isTravelReservation(value: unknown): value is TravelReservation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TravelReservation> & Record<string, unknown>;
  if (!item.id || !item.title || !["planned", "confirmed", "cancelled"].includes(item.status ?? "")) return false;
  if (item.kind === "transport" && !["flight", "train", "coach", "ferry", "drive", "other"].includes(String(item.mode ?? ""))) return false;
  if (item.kind === "stay" && !["hotel", "homestay", "hostel", "friends", "other"].includes(String(item.stay_type ?? ""))) return false;
  if (item.kind !== "transport" && item.kind !== "stay") return false;
  return Object.keys(validateReservation(item as TravelReservation)).length === 0;
}
```

修改 `normalizeTrip`：

```ts
const reservations = trip.reservations ?? [];
if (!Array.isArray(reservations) || !reservations.every(isTravelReservation)) return null;
return { ...trip, travelers: trip.travelers ?? 2, reservations } as Itinerary;
```

不得提升 `travel:library:v2` 版本号；新增字段可选，旧记录可以原位兼容。不得捕获并改写损坏的 v2 数据。

- [ ] **Step 4: 运行存储测试和完整回归**

Run: `npm.cmd test -- src/lib/travel-store.test.ts`  
Expected: PASS。  
Run: `npm.cmd test`  
Expected: 全部 PASS。

- [ ] **Step 5: 记录数据迁移检查点**

人工检查三个输入：旧单行程键、旧多行程键、现有 v2；三者都应保留原内容并补出空数组。当前工作区不提交。

---

### Task 4: 交通住宿表单、卡片与准备度界面

**Files:**
- Create: `apps/web/src/components/itinerary/reservation-editor.tsx`
- Create: `apps/web/src/components/itinerary/reservation-editor.test.tsx`
- Create: `apps/web/src/components/itinerary/travel-logistics.tsx`
- Create: `apps/web/src/components/itinerary/travel-logistics.test.tsx`

**Interfaces:**
- Consumes: `TravelReservation`、`validateReservation()`、`getTripReadiness()`、`findReservationIssues()`、`sortReservations()`。
- Produces: `ReservationEditor` 和 `TravelLogistics`；后者不访问 localStorage。

`ReservationEditor` props：

```ts
type ReservationEditorProps = {
  value: TravelReservation;
  onChange: (value: TravelReservation) => void;
  onSubmit: () => void;
  onCancel: () => void;
};
```

`TravelLogistics` props：

```ts
type TravelLogisticsProps = {
  itinerary: Itinerary;
  draft: TravelReservation | null;
  onDraftChange: (value: TravelReservation | null) => void;
  onCommit: (value: TravelReservation) => void;
  onDelete: (id: string) => void;
};
```

- [ ] **Step 1: 写表单校验与提交的失败测试**

```tsx
test("交通表单阻止倒序时间并提交完整当地时间", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  function Harness() {
    const [value, setValue] = useState<TravelReservation>(train);
    return <ReservationEditor value={value} onChange={setValue} onSubmit={commit} onCancel={() => {}} />;
  }
  render(<Harness />);
  await user.clear(screen.getByLabelText("到达时间"));
  await user.type(screen.getByLabelText("到达时间"), "2026-10-02T07:00");
  await user.click(screen.getByRole("button", { name: "保存交通" }));
  expect(screen.getByRole("alert")).toHaveTextContent("晚于出发时间");
  expect(commit).not.toHaveBeenCalled();
});

test("费用留空和明确填写零元保持不同数据", async () => {
  const onChange = vi.fn();
  render(<ReservationEditor value={{ ...stay, cost: undefined }} onChange={onChange} onSubmit={() => {}} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("费用"), "0");
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 0 }));
});
```

- [ ] **Step 2: 写交通住宿中心的失败测试**

```tsx
test("展示准备度、住宿缺口和已取消记录但不计入统计", () => {
  render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [train, stay, { ...stay, id: "cancelled", status: "cancelled" }] }} draft={null} onDraftChange={() => {}} onCommit={() => {}} onDelete={() => {}} />);
  expect(screen.getByText("已确认 1")).toBeInTheDocument();
  expect(screen.getByText("待确认 1")).toBeInTheDocument();
  expect(screen.getByText("住宿覆盖 2 / 3 晚")).toBeInTheDocument();
  expect(screen.getByText(/尚未记录住宿安排/)).toBeInTheDocument();
  expect(screen.getByText("已取消")).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试并确认组件不存在**

Run: `npm.cmd test -- src/components/itinerary/reservation-editor.test.tsx src/components/itinerary/travel-logistics.test.tsx`  
Expected: FAIL，提示无法解析两个组件。

- [ ] **Step 4: 实现受控编辑器**

使用 `type="datetime-local"` 和 `type="date"`。费用变化必须保留空值：

```tsx
const updateCost = (raw: string) => onChange({
  ...value,
  cost: raw === "" ? undefined : Number(raw),
});
const submit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const nextErrors = validateReservation(value);
  setErrors(nextErrors);
  const first = Object.keys(nextErrors)[0];
  if (first) {
    const target = event.currentTarget.elements.namedItem(first);
    if (target instanceof HTMLElement) target.focus();
    return;
  }
  onSubmit();
};
```

交通与住宿字段分别渲染；每个错误用 `<small id="error-field">` 并通过 `aria-describedby` 关联。表单底部显示：“时间按当地时间填写；请勿填写证件号码或支付信息。”

- [ ] **Step 5: 实现中心页面和页面内删除确认**

```tsx
const readiness = getTripReadiness(itinerary);
const issues = findReservationIssues(itinerary);
const reservations = sortReservations(itinerary.reservations ?? []);
const transports = reservations.filter(value => value.kind === "transport");
const stays = reservations.filter(value => value.kind === "stay");
```

当 `readiness.totalNights === 0` 时显示“日期确定后可检查住宿覆盖”，不能显示 `0 / 0 晚` 或断言住宿已经完整。

“添加交通”和“添加住宿”分别创建带 `crypto.randomUUID()` 的完整草稿；标题与日期初值为空，不伪造预订。编辑把记录的结构化克隆交给 `onDraftChange`。删除第一次点击只显示页面内确认区，确认后才调用 `onDelete(id)`；取消状态仍显示卡片但使用弱化样式。

- [ ] **Step 6: 运行组件测试和无障碍查询检查**

Run: `npm.cmd test -- src/components/itinerary/reservation-editor.test.tsx src/components/itinerary/travel-logistics.test.tsx`  
Expected: PASS；测试通过角色和可访问名称找到输入与按钮，不依赖 CSS 类或测试 ID。

- [ ] **Step 7: 记录 UI 组件检查点**

运行 `npm.cmd run typecheck`，预期 exit 0。只读审查敏感字段、错误焦点、取消/删除差异和无 localStorage 访问；当前工作区不提交。

---

### Task 5: 接入行程详情、撤销保存与行程库摘要

**Files:**
- Modify: `apps/web/src/components/itinerary/itinerary-view.tsx:21-190`
- Modify: `apps/web/src/components/itinerary/itinerary-view.test.tsx`
- Modify: `apps/web/src/components/trips/trips-library.tsx:105-118`
- Modify: `apps/web/src/components/trips/trips-library.test.tsx`

**Interfaces:**
- Consumes: Task 1–4 的纯函数和组件。
- Produces: 行程级“日程 / 交通住宿”切换；交通住宿 CRUD 进入现有 `commit()`；行程卡片显示准备状态。

- [ ] **Step 1: 写行程详情完整闭环的失败测试**

```tsx
// 将现有 testing-library 导入补充为：
// import { fireEvent, render, screen, within } from "@testing-library/react";
test("交通住宿修改进入现有未保存、撤销和保存闭环", async () => {
  render(<ItineraryView itinerary={{ ...DEMO_ITINERARY, reservations: [] }} onSave={saveTrip} />);
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  await userEvent.click(screen.getByRole("button", { name: "添加交通" }));
  await userEvent.type(screen.getByLabelText("交通名称"), "南京到苏州");
  await userEvent.type(screen.getByLabelText("出发地点"), "南京南站");
  await userEvent.type(screen.getByLabelText("到达地点"), "苏州站");
  fireEvent.change(screen.getByLabelText("出发时间"), { target: { value: "2026-10-02T08:00" } });
  fireEvent.change(screen.getByLabelText("到达时间"), { target: { value: "2026-10-02T09:35" } });
  await userEvent.click(screen.getByRole("button", { name: "保存交通" }));
  expect(screen.getByLabelText("保存状态")).toHaveTextContent("未保存");
  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.queryByText("南京到苏州")).not.toBeInTheDocument();
});

test("切换回日程再返回不会丢失未提交表单", async () => {
  render(<ItineraryView itinerary={{ ...DEMO_ITINERARY, reservations: [] }} />);
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  await userEvent.click(screen.getByRole("button", { name: "添加住宿" }));
  await userEvent.type(screen.getByLabelText("住宿名称"), "苏州酒店");
  await userEvent.click(screen.getByRole("tab", { name: "日程" }));
  await userEvent.click(screen.getByRole("tab", { name: "交通住宿" }));
  expect(screen.getByLabelText("住宿名称")).toHaveValue("苏州酒店");
});
```

- [ ] **Step 2: 写行程库准备状态的失败测试**

```tsx
test("行程卡片显示预订准备状态但不展示完整编号", async () => {
  saveTrip({ ...DEMO_ITINERARY, reservations: [{ ...train, status: "planned", confirmation_code: "PRIVATE-123" }] });
  render(<TripsLibrary navigate={() => undefined} />);
  expect(await screen.findByText("1 项待确认")).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE-123")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试并确认入口不存在**

Run: `npm.cmd test -- src/components/itinerary/itinerary-view.test.tsx src/components/trips/trips-library.test.tsx`  
Expected: FAIL，缺少“交通住宿”标签和准备状态。

- [ ] **Step 4: 将草稿和视图状态提升到 ItineraryView**

```tsx
const [workspace, setWorkspace] = useState<"schedule" | "logistics">("schedule");
const [reservationDraft, setReservationDraft] = useState<TravelReservation | null>(null);

const commitReservation = (value: TravelReservation) => {
  commit(upsertReservation(current, value));
  setReservationDraft(null);
};
const deleteReservation = (id: string) => {
  commit(removeReservation(current, id));
  setReservationDraft(null);
};
```

增加 `role="tablist" aria-label="行程工作区"`。日程与交通住宿面板都保持挂载，用 `hidden` 切换可见性，确保草稿不因切换卸载；隐藏日程面板时不得继续接受键盘焦点。`TravelLogistics` 的提交和删除只能调用以上函数，不能直接保存。

- [ ] **Step 5: 接入卡片摘要**

在 `TripsLibrary` 每张活动行程卡片中计算：

```tsx
const readiness = getTripReadiness(trip);
const readinessLabel = readiness.planned > 0
  ? `${readiness.planned} 项待确认`
  : readiness.confirmed > 0 ? "交通住宿已确认" : "交通住宿待补充";
```

只显示 `readinessLabel`；不得显示预订编号、联系电话或备注。

- [ ] **Step 6: 运行集成测试与完整回归**

Run: `npm.cmd test -- src/components/itinerary/itinerary-view.test.tsx src/components/trips/trips-library.test.tsx`  
Expected: PASS。  
Run: `npm.cmd test`  
Expected: 全部 PASS。

- [ ] **Step 7: 记录集成检查点**

运行 `npm.cmd run typecheck`，预期 exit 0。只读审查现有地图、地点编辑、保存失败和离开提醒未被绕过；当前工作区不提交。

---

### Task 6: 响应式样式、文档和真实浏览器验收

**Files:**
- Modify: `apps/web/src/app/landing.css`
- Modify: `README.md:48-51`
- Test: `apps/web/src/components/itinerary/reservation-editor.test.tsx`
- Test: `apps/web/src/components/itinerary/travel-logistics.test.tsx`

**Interfaces:**
- Consumes: Task 4–5 的稳定 DOM 类和可访问名称。
- Produces: 桌面双列、移动单列、清晰状态层级和最终可验收构建。

- [ ] **Step 1: 在组件测试中增加可访问交互边界**

```tsx
test("删除必须二次确认且取消不会修改行程", async () => {
  const onDelete = vi.fn();
  render(<TravelLogistics itinerary={{ ...DEMO_ITINERARY, reservations: [train] }} draft={null} onDraftChange={() => {}} onCommit={() => {}} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "删除南京到苏州" }));
  expect(screen.getByText(/删除后可在保存前撤销/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试并确认删除确认文案或行为尚未满足**

Run: `npm.cmd test -- src/components/itinerary/travel-logistics.test.tsx`  
Expected: 若 Task 4 尚无同名确认文案则 FAIL；补齐确认区后再运行至 PASS。

- [ ] **Step 3: 添加聚焦且响应式的样式**

```css
.trip-workspace-tabs { display: flex; gap: 4px; margin: 20px 0; border-bottom: 1px solid var(--line); }
.trip-workspace-tabs button { min-height: 44px; padding: 0 18px; border: 0; border-bottom: 2px solid transparent; background: transparent; }
.trip-workspace-tabs button[aria-selected="true"] { color: #24836d; border-bottom-color: var(--accent); font-weight: 700; }
.logistics-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.logistics-columns, .reservation-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.reservation-card, .logistics-alerts, .reservation-editor { border: 1px solid var(--line); border-radius: 12px; background: white; }
.reservation-card.is-cancelled { opacity: .62; }
@media (max-width: 760px) {
  .logistics-summary, .logistics-columns, .reservation-form-grid { grid-template-columns: minmax(0, 1fr); }
  .reservation-card button, .reservation-editor button, .trip-workspace-tabs button { min-height: 44px; }
}
```

沿用当前薄荷色和边框，不加入新的主色、渐变、大面积插画或炫技动画。卡片保留现有轻微 hover；`prefers-reduced-motion` 下不依赖动画表达状态。

- [ ] **Step 4: 更新 README 当前能力与边界**

在核心能力中增加“手动管理交通、住宿、状态与准备度”；在当前边界中明确“预订信息为用户手动录入，平台未向供应商核验；无实时价格或航班状态；本地数据不是云同步”。

- [ ] **Step 5: 运行完整自动验证**

Run: `npm.cmd test`  
Expected: 旧 75 项与所有新增测试全部 PASS。  
Run: `npm.cmd run typecheck`  
Expected: exit 0。  
Run: `npm.cmd run build`  
Expected: Next.js 静态页面构建完成，`/`、`/plan/new`、`/trips`、`/trips/demo` 均生成。

- [ ] **Step 6: 桌面浏览器完整路径**

使用独立 Playwright 会话访问 `http://127.0.0.1:3001/trips/demo/`，设置 1280×800：

1. 打开旧行程，切到“交通住宿”。
2. 添加 2026-10-02 南京南站→苏州站交通。
3. 添加 10月2日–4日住宿，确认显示 `2 / 3 晚` 和缺少 10月4日晚提示。
4. 将交通时间改到与活动重叠，确认出现具体活动名称；修正后提示消失。
5. 取消一条记录，确认准备度和覆盖重新计算。
6. 保存、刷新，确认所有字段恢复。
7. 模拟 localStorage 写入失败，确认修改保留并可重试。

检查 URL、页面标题、有效正文、无框架错误覆盖层、无相关 console error；保存桌面截图到仓库外临时目录。

- [ ] **Step 7: 移动浏览器路径**

设置 390×844，重复新增/编辑/删除取消操作；断言：

```js
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
  throw new Error("mobile horizontal overflow");
}
```

确认表单单列、关键操作目标至少 44px、删除确认可见、键盘导航顺序合理；保存手机截图到仓库外临时目录。

- [ ] **Step 8: 最终需求核对与检查点**

逐条对照设计文档第 2、7、8、9 节；记录未测试项。确认首页、地图 API 和部署文件没有变化。当前工作区不提交；如果以后迁移到独立仓库，再按 Task 1–6 分别提交对应文件。
