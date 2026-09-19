# 行程详情 V2 与高德地图接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接通高德真实地点与路线服务，并把保存后的行程详情升级为可排序、同城跨日移动、整天复制/清空、自动保存和多步撤销的成熟编辑器。

**Architecture:** 保留 FastAPI 作为高德密钥与请求校验边界，前端继续只消费项目内 `/api/maps/*` 契约。日程结构变更集中在纯函数模块，保存与撤销集中在独立 React hook，详情组件只组织交互；地图结果保持短生命周期，不写入长期行程数据。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library、FastAPI、Pytest、httpx、高德地图 JS API 2.0 / Web 服务 API、Playwright CLI。

**Spec:** `docs/superpowers/specs/2026-09-19-trip-detail-v2-amap-design.md`

## Global Constraints

- `AMAP_WEB_SERVICE_KEY` 与 `AMAP_JS_SECURITY_CODE` 只能存在于被忽略的 `apps/api/.env.local`，不得进入源码、文档、测试输出或浏览器包。
- 浏览器只能获得可公开的 `AMAP_JS_KEY`；地点搜索和路线请求必须经过 FastAPI。
- 旧行程缺少 `location_source` 时不得把历史坐标当作真实高德定位。
- 桌面拖拽必须有键盘和移动端按钮等价操作。
- 排序和同城跨日移动不改预算；复制和清空按实际新增/移除地点调整计划支出。
- 自动保存失败不得丢失当前修改；手动重试必须保存最新快照。
- 地图服务失败不得阻止日程、交通住宿或预算编辑。
- 不新增产品依赖，不改首页，不部署 Netlify。
- 当前项目不是独立 Git 根；不得对 `D:\` 根创建提交，使用项目内 SDD ledger 记录检查点。

## Review Focus

- 自动保存请求执行时又产生新修改：旧保存完成不能把较新的界面状态错误标为已保存；组件测试必须覆盖。
- 拖拽到同一索引、列表末尾以及向下移动时的索引偏移：纯函数和组件测试必须分别覆盖。
- 同城跨日移动后源日为空、目标日已有同名 POI：不得崩溃或重复计费；纯函数测试必须覆盖。
- 高德状态成功但 JS SDK、搜索或路线单项失败：每项独立降级，手动编辑仍可用；组件/API 测试必须覆盖。
- 锁定必去地点参与排序与复制但不能被清空或替换：纯函数和组件测试必须覆盖。

---

### Task 1: 安全配置并验证高德服务边界

**Files:**

- Create (ignored, secret): `apps/api/.env.local`
- Create (ignored): `apps/web/.env.local`
- Modify: `apps/api/tests/test_maps.py`
- Modify: `docs/map-integration.md`

**Interfaces:**

- Consumes: 用户已提供的 Web 服务 Key、JS API Key、安全密钥；现有 `GET /api/maps/status`、`GET /api/maps/places`、`POST /api/maps/route`。
- Produces: 本地可用的 8000 端口地图后端；对前端保持现有 `MapStatus`、`MapPlace`、`MapRoute` 契约。

- [ ] **Step 1: 添加状态接口保密测试**

在 `apps/api/tests/test_maps.py` 新增测试，临时设置三个环境变量，验证状态只返回公开 JS Key：

```py
def test_status_exposes_only_public_js_key(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "server-secret")
    monkeypatch.setenv("AMAP_JS_KEY", "public-js-key")
    monkeypatch.setenv("AMAP_JS_SECURITY_CODE", "security-secret")

    response = TestClient(app).get("/api/maps/status")

    assert response.status_code == 200
    assert response.json() == {
        "search_available": True,
        "map_available": True,
        "js_key": "public-js-key",
    }
    assert "server-secret" not in response.text
    assert "security-secret" not in response.text
```

- [ ] **Step 2: 运行 API 测试并确认测试约束真实存在**

Run: `& '.\.venv\Scripts\python.exe' -m pytest apps\api\tests\test_maps.py -q`

Expected: 新测试 PASS；若现有环境未安装依赖，先按 `apps/api/requirements.txt` 安装到项目 `.venv`，不使用系统 Python。

- [ ] **Step 3: 写入本地忽略配置**

使用当前会话附件中用户提供的 Web 服务 Key、JS API Key 与安全密钥创建 `apps/api/.env.local`。文件只包含对应的三个 `AMAP_*` 变量，以及值为 `http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001` 的 `CORS_ORIGINS`；真实值不得复制到计划、命令输出或 ledger。

创建 `apps/web/.env.local`：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

安全检查只输出变量名和“已配置/缺失”，不输出值。确认 `.gitignore` 覆盖两个 `.env.local`；若未覆盖，先补忽略规则再创建文件。

- [ ] **Step 4: 启动后端并执行实网冒烟**

从 `apps/api` 启动后端并使用 `.env.local`，然后依次验证：

```text
GET  http://127.0.0.1:8000/api/maps/status
GET  http://127.0.0.1:8000/api/maps/places?query=苏州博物馆&city=苏州
POST http://127.0.0.1:8000/api/maps/route
```

路线请求使用搜索结果中的两个真实坐标，先验证 `walking`；响应必须包含非负距离、时长和高德折线或明确的“暂无可绘制线路”。日志和验收记录只保存状态码、结果数量与布尔判断，不保存 Key 或完整供应商响应。

- [ ] **Step 5: 更新地图接入说明**

将 `docs/map-integration.md` 中“自动生成仍是演示规划”改为当前本地规则规划事实；增加“本地实网联调已接通、截图密钥上线前轮换、Netlify 仍需要独立 HTTPS 后端”的说明。

- [ ] **Step 6: 记录 Task 1 检查点**

创建 `.superpowers/sdd/2026-09-19-trip-detail-v2-amap/progress.md`，记录测试命令、冒烟结果、未打印秘密的安全检查与无 Git 提交原因。

---

### Task 2: 扩展日程纯函数编辑与诊断

**Files:**

- Modify: `apps/web/src/lib/itinerary-edits.ts`
- Modify: `apps/web/src/lib/itinerary-edits.test.ts`

**Interfaces:**

- Consumes: `Itinerary`、`ItineraryDay`、`ItineraryItem`。
- Produces:

```ts
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

export function normalizeDayTimes(itinerary: Itinerary, dayIndex: number, startTime?: string): Itinerary;
export function moveScheduleItem(itinerary: Itinerary, move: ScheduleMove): Itinerary;
export function duplicateDayItems(itinerary: Itinerary, fromDayIndex: number, toDayIndex: number): Itinerary;
export function clearDayItems(itinerary: Itinerary, dayIndex: number): Itinerary;
export function updateItemTiming(itinerary: Itinerary, dayIndex: number, itemIndex: number, time: string, durationMinutes: number): Itinerary;
export function analyzeDaySchedule(day: ItineraryDay): ScheduleIssue[];
```

- [ ] **Step 1: 写入失败的排序与跨日测试**

在 `itinerary-edits.test.ts` 增加：同日向上/向下/末尾移动、原位无操作、同城跨日、跨城拒绝、源日为空、输入不变。核心断言：

```ts
test("同日向下移动正确处理删除后的目标索引并重排时间", () => {
  const original = fixture();
  const next = moveScheduleItem(original, { fromDayIndex: 0, fromItemIndex: 0, toDayIndex: 0, toItemIndex: 2 });
  expect(next.days[0].items.map(item => item.name)).toEqual(["博物馆", "平江路", "拙政园"]);
  expect(next.days[0].items.map(item => item.time)).toEqual(["09:00", "11:30", "13:20"]);
  expect(next.days[0].items.every(item => item.transport == null)).toBe(true);
  expect(original.days[0].items[0].name).toBe("拙政园");
});

test("已定位地点只允许移动到同城日期", () => {
  expect(moveScheduleItem(original, { fromDayIndex: 0, fromItemIndex: 0, toDayIndex: 2, toItemIndex: 0 })).toBe(original);
});
```

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run: `pnpm --dir apps/web test src/lib/itinerary-edits.test.ts`

Expected: FAIL because `moveScheduleItem` and `normalizeDayTimes` are not exported.

- [ ] **Step 3: 实现时间重排和移动**

实现严格 `HH:mm` 转分钟/回写辅助函数；移动前验证日、地点、索引和同城约束。同日移动先删除再按最终索引插入；受影响日期调用内部规范化函数并清除非城际交通字段。非法操作返回原对象。

- [ ] **Step 4: 写入失败的复制、清空和预算测试**

覆盖同城复制去重、跨城拒绝、复制新增费用、清空保留锁定地点、清空扣减费用、空日无操作：

```ts
test("复制当天只添加目标日缺少的地点并增加实际新增费用", () => {
  const next = duplicateDayItems(original, 0, 1);
  expect(next.days[1].items.filter(item => item.poi_id === "poi-garden")).toHaveLength(1);
  expect(next.budget.tickets).toBe(original.budget.tickets + 80 * original.travelers);
});

test("清空当天保留锁定地点并扣减普通地点费用", () => {
  const next = clearDayItems(original, 0);
  expect(next.days[0].items.map(item => item.name)).toEqual(["拙政园"]);
  expect(next.budget.estimated_total).toBeLessThan(original.budget.estimated_total);
});
```

- [ ] **Step 5: 运行聚焦测试并确认第二轮 RED**

Run: `pnpm --dir apps/web test src/lib/itinerary-edits.test.ts`

Expected: 新增复制/清空测试 FAIL because the functions are absent.

- [ ] **Step 6: 实现复制、清空与预算调整**

使用 `poi_id` 优先、否则规范化名称作为去重身份；复制采用深拷贝。复用 `adjustBudget` 对实际新增/移除项逐项调整，最后重排目标日；如果没有实际变化返回原对象。

- [ ] **Step 7: 写入失败的精确时间与诊断测试**

覆盖有效更新、跨午夜拒绝、重叠、19:00 后结束、强度容量、未定位与已定位高德地点：

```ts
test("诊断重叠、晚结束、过密与待定位", () => {
  const issues = analyzeDaySchedule(problemDay);
  expect(issues.map(issue => issue.kind)).toEqual(expect.arrayContaining(["overlap", "late", "dense", "unlocated"]));
});
```

- [ ] **Step 8: 运行 RED，随后实现并转 GREEN**

Run: `pnpm --dir apps/web test src/lib/itinerary-edits.test.ts`

实现 `updateItemTiming` 与 `analyzeDaySchedule`，再运行同一命令。Expected: all itinerary edit tests PASS.

- [ ] **Step 9: 运行回归与类型检查**

```text
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: 全部通过。将精确数量记录到 ledger。

---

### Task 3: 建立防抖自动保存与多步撤销会话

**Files:**

- Create: `apps/web/src/components/itinerary/use-itinerary-editor.ts`
- Create: `apps/web/src/components/itinerary/use-itinerary-editor.test.tsx`
- Modify: `apps/web/src/components/itinerary/itinerary-view.tsx`
- Modify: `apps/web/src/components/itinerary/itinerary-view.test.tsx`

**Interfaces:**

- Consumes: 初始 `Itinerary`、可选同步 `onSave`、`autosaveBlocked`。
- Produces:

```ts
type SaveState = "saved" | "dirty" | "saving" | "failed";

export function useItineraryEditor(options: {
  itinerary: Itinerary;
  onSave?: (value: Itinerary) => void;
  initiallySaved: boolean;
  autosaveBlocked: boolean;
}): {
  current: Itinerary;
  commit: (next: Itinerary) => void;
  undo: () => void;
  canUndo: boolean;
  saveNow: () => void;
  saveState: SaveState;
  hasUnsaved: boolean;
  statusMessage: string;
};
```

- [ ] **Step 1: 写入 hook 的失败测试**

使用 Vitest fake timers 和真实测试壳组件覆盖 600ms 防抖、相同对象不保存、连续修改只保存最新、保存期间再修改、失败重试、最多 20 步撤销、切换 itinerary 重置：

```tsx
test("连续修改只自动保存最新快照", async () => {
  const save = vi.fn();
  render(<Harness onSave={save} />);
  await userEvent.click(screen.getByRole("button", { name: "修改一次" }));
  await userEvent.click(screen.getByRole("button", { name: "再修改" }));
  await act(async () => vi.advanceTimersByTime(600));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].title).toBe("最新标题");
});
```

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run: `pnpm --dir apps/web test src/components/itinerary/use-itinerary-editor.test.tsx`

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: 实现 hook**

使用最多 20 条的快照栈和 600ms effect 定时器；用 revision/ref 判断保存完成时对应的是否仍为当前快照。同步 `onSave` 抛错进入 failed；`saveNow` 取消定时器并保存当前最新值；`autosaveBlocked` 时保持 dirty 不调保存。

- [ ] **Step 4: 验证 hook 转 GREEN**

Run: `pnpm --dir apps/web test src/components/itinerary/use-itinerary-editor.test.tsx`

Expected: all hook tests PASS.

- [ ] **Step 5: 写入详情页失败集成测试**

验证状态文案“未保存/正在保存/已自动保存/自动保存失败”、手动重试、撤销触发新保存、打开交通住宿或预算草稿时阻塞自动保存、离页只在未保存/失败/草稿时提醒。

- [ ] **Step 6: 运行详情测试并确认 RED**

Run: `pnpm --dir apps/web test src/components/itinerary/itinerary-view.test.tsx`

Expected: FAIL against current single-step undo and manual-only save flow.

- [ ] **Step 7: 将详情页接入 hook**

移除组件内 `previous`、`savedSnapshot`、`saveFailed` 和旧 `save` 实现；所有已确认修改继续通过统一 `commit` 进入 hook。保留手动按钮，文案在失败时为“重试保存”，其他状态为“立即保存”。未确认的地点、预算、交通住宿草稿仍由页面持有并传给 `autosaveBlocked`。

- [ ] **Step 8: 运行聚焦、全量与类型检查**

```text
pnpm --dir apps/web test src/components/itinerary/use-itinerary-editor.test.tsx src/components/itinerary/itinerary-view.test.tsx
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: 全部通过并记录到 ledger。

---

### Task 4: 增加拖拽、移动端等价操作与日期工具

**Files:**

- Modify: `apps/web/src/components/itinerary/itinerary-view.tsx`
- Modify: `apps/web/src/components/itinerary/itinerary-view.test.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/landing.css`

**Interfaces:**

- Consumes: Task 2 的移动、复制、清空、时间更新、诊断函数；Task 3 的 `commit` 和保存状态。
- Produces: 桌面拖拽与所有端通用按钮交互；不新增跨模块 API。

- [ ] **Step 1: 写入按钮排序和跨日移动失败测试**

测试选择卡片后出现“上移”“下移”“自动重新排程”“移动安排”；首项上移、末项下移禁用；同城目标日可选、跨城日不出现；操作后时间和选中索引正确。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm --dir apps/web test src/components/itinerary/itinerary-view.test.tsx`

Expected: FAIL because buttons and new move function are not wired.

- [ ] **Step 3: 接入移动端与键盘等价操作**

调整面板增加上下移动、精确开始时间与停留时长表单、自动重排；继续保留替换、同城跨日和删除。所有按钮设置可读 `aria-label`，禁用时用邻近说明文字解释。

- [ ] **Step 4: 写入拖拽失败测试**

使用 `fireEvent.dragStart`、`dragOver`、`drop` 验证从第 1 项拖到末尾与原位放下；断言与按钮排序结果一致，并验证切换日期后旧拖拽状态不生效。

- [ ] **Step 5: 运行拖拽测试并确认 RED**

Run: `pnpm --dir apps/web test src/components/itinerary/itinerary-view.test.tsx`

Expected: drag tests FAIL because cards are not draggable.

- [ ] **Step 6: 实现原生桌面拖拽**

在时间轴卡片加入独立拖拽把手和 `draggable`；组件状态只保存来源/目标索引，drop 时调用 `moveScheduleItem`。`dragend`、日期切换和工作区切换统一清空拖拽状态。减少动态效果设置下关闭位移动画。

- [ ] **Step 7: 写入复制/清空确认失败测试**

测试“复制当天”只列同城目标日、确认后去重；“清空当天”二次确认并保留必去；取消时无变化；不存在同城日时按钮禁用。

- [ ] **Step 8: 实现日期工具与日程诊断 UI**

在 day tabs 下方增加紧凑工具栏和确认面板。将 `analyzeDaySchedule(day)` 渲染为带图标和文字的提示列表；按类型合并重复提示但保留相关地点名。长名称使用 `overflow-wrap:anywhere`。

- [ ] **Step 9: 完成响应式样式与回归**

桌面保持时间轴/地图双栏；移动端工具栏换行、按钮高度至少 44px、拖拽把手隐藏但按钮保留、无横向溢出。运行：

```text
pnpm --dir apps/web test src/components/itinerary/itinerary-view.test.tsx src/lib/itinerary-edits.test.ts
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: 全部通过。

---

### Task 5: 完善地图联动、失败降级与最终验收

**Files:**

- Modify: `apps/web/src/components/itinerary/place-editor.tsx`
- Modify: `apps/web/src/components/itinerary/place-editor.test.tsx`
- Modify: `apps/web/src/components/itinerary/route-map.tsx`
- Modify: `apps/web/src/components/itinerary/route-map.test.tsx`
- Modify: `apps/web/src/components/itinerary/map-canvas.tsx`
- Modify: `apps/web/src/components/itinerary/map-canvas.test.tsx`
- Modify: `apps/web/src/lib/maps.ts`
- Modify: `README.md`
- Verify: `apps/api/tests/test_maps.py`

**Interfaces:**

- Consumes: Task 1 已接通的地图后端；现有 `MapPlace`、`MapRoute` 与行程高德字段。
- Produces: 完成的真实地图编辑体验和最终验收证据。

- [ ] **Step 1: 写入地图状态拆分与竞态失败测试**

覆盖：地图可用但搜索不可用、搜索可用但 JS 地图不可用、快速连续搜索只显示最后结果、组件卸载取消请求、地图 SDK 失败后重试。对 `fetch`/SDK 只在网络边界 mock，断言真实用户文案和保存的 `ItineraryItem` 字段。

- [ ] **Step 2: 运行地图组件测试并确认 RED**

```text
pnpm --dir apps/web test src/components/itinerary/place-editor.test.tsx src/components/itinerary/route-map.test.tsx src/components/itinerary/map-canvas.test.tsx
```

Expected: 至少新增的部分服务状态与重试测试 FAIL。

- [ ] **Step 3: 实现最小地图完善**

地点编辑器分别表达搜索与地图能力，不把一个失败误报为全部不可用。地图首次定位使用全部真实标记的 fit view；没有真实地点时保持空状态，不定位到默认北京。路线结果在 items、路段或交通方式变化时失效；过期请求结果用 revision 忽略。

- [ ] **Step 4: 运行前后端完整自动化门禁**

```text
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
& '.\.venv\Scripts\python.exe' -m pytest apps\api\tests -q
```

Expected: 所有测试 PASS；Next 静态路由构建成功；Pytest 全部通过。

- [ ] **Step 5: 桌面真实浏览器验收**

使用 Playwright CLI 在 `1280×800`：

1. 打开已保存行程；
2. 搜索“苏州博物馆”并选择真实结果；
3. 验证地址、标点与高德来源；
4. 添加第二个同城真实地点，计算步行、驾车、公交路线；
5. 拖拽排序，验证旧路线清除、时间自动重排；
6. 同城跨日移动、复制一天、清空普通安排；
7. 等待自动保存，刷新后验证最终状态；
8. 连续撤销并验证再次自动保存；
9. 验证日程、交通住宿、预算页签继续工作。

- [ ] **Step 6: 移动与失败浏览器验收**

在 `390×844` 使用上移/下移、精确时间和跨日移动完成等价操作；测量 `scrollWidth <= clientWidth`，按钮高度至少 44px。随后停止本轮自行启动的 API 服务或切换前端 API 地址到不可达端口，验证地图降级但编辑、撤销和保存仍可用，再恢复服务。不得清理用户真实浏览器中的行程库来模拟失败。

- [ ] **Step 7: 密钥泄露与控制台检查**

检查浏览器网络、控制台、构建输出与项目搜索结果：不得出现 Web 服务 Key 或安全密钥；允许公开 JS Key 只出现在状态响应和高德 SDK URL。确认没有 hydration、未处理 Promise 或框架错误层。

- [ ] **Step 8: README 与最终自审**

更新 README：真实地点/路线已在本地接通、地图后端启动命令、自动保存与拖拽能力、生产部署仍需 HTTPS 后端和轮换密钥。按 code-reviewer rubric 对规格、计划和所有改动做独立自审；多代理未获授权时明确记录为 inline self-review。修复所有 Critical/Important 后重跑 Step 4。

- [ ] **Step 9: 记录最终检查点**

将测试数量、构建路由、真实搜索/路线状态、桌面/移动测量、控制台结论、密钥未泄露检查和“不部署”写入 ledger；保留本轮启动的开发服务器供用户检查，但不自动部署。
