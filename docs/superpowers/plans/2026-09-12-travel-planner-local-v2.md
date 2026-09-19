# 旅行规划本地完善版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有演示站完善为可生成、保存多份、再次打开并做基础调整的本地产品闭环。

**Architecture:** 用纯函数演示规划器生成与输入一致的行程，用单独的 localStorage 仓库管理多份记录和当前选择。行程详情持有可编辑副本与单步撤销快照，“我的旅行”通过同一仓库读取、打开和删除。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library、FastAPI、Pytest

**Spec:** `docs/superpowers/specs/2026-09-12-travel-planner-local-v2-design.md`

## Global Constraints

- 不接入外部地图、AI、票务、酒店、微信或会员服务。
- 不执行 Netlify 或其他线上部署。
- 仅苏州、杭州使用演示地点数据，未知城市必须明确标注数据待接入。
- 继续使用 PRD 的白底、深色正文、橙色强调、时间轴与地图容器模型。
- 每个行为先写失败测试并确认失败，再实现最小代码。

---

### Task 1: 行程数据契约与个性化演示规划器

**Files:**
- Create: `apps/web/src/lib/personalize-itinerary.ts`
- Create: `apps/web/src/lib/personalize-itinerary.test.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/demo-itinerary.ts`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/planner.py`
- Modify: `apps/api/tests/test_planner.py`

**Interfaces:**
- Consumes: `TripDraft`, `DEMO_ITINERARY`.
- Produces: `personalizeDemoItinerary(draft: TripDraft): Itinerary`; `Itinerary.travelers: number`.

- [x] **Step 1: Write failing tests** proving travelers, dates, days, route and total budget reflect literal draft values.
- [x] **Step 2: Run the targeted Vitest and Pytest tests** and confirm failures are caused by the missing field/function.
- [x] **Step 3: Implement the minimal pure function and API schema field**, cloning demo days without mutating the seed.
- [x] **Step 4: Run targeted and full tests** and confirm they pass.

### Task 2: Multi-trip browser repository

**Files:**
- Create: `apps/web/src/lib/travel-store.ts`
- Create: `apps/web/src/lib/travel-store.test.ts`
- Modify: `apps/web/src/components/planner/planner-wizard.tsx`
- Modify: `apps/web/src/components/itinerary/saved-itinerary.tsx`

**Interfaces:**
- Produces: `readTrips`, `saveTrip`, `selectTrip`, `readSelectedTrip`, `deleteTrip`.

- [x] **Step 1: Write failing tests** for multiple saves, ID replacement, selection, legacy migration and deletion.
- [x] **Step 2: Run the targeted test** and confirm the repository module is missing.
- [x] **Step 3: Implement storage parsing and mutations** with malformed-data fallback.
- [x] **Step 4: Replace direct storage access in generator/detail** and run all frontend tests.

### Task 3: My Trips page

**Files:**
- Create: `apps/web/src/components/trips/trips-library.tsx`
- Create: `apps/web/src/components/trips/trips-library.test.tsx`
- Create: `apps/web/src/app/trips/page.tsx`
- Modify: `apps/web/src/components/site-header.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: travel-store functions.
- Produces: `/trips/` local trip list with open, delete and empty states.

- [x] **Step 1: Write failing component tests** for rendering a saved trip, opening it, deleting it and empty CTA.
- [x] **Step 2: Run tests** and confirm failure because the component does not exist.
- [x] **Step 3: Implement list and route** in the accepted design system.
- [x] **Step 4: Run component and full frontend tests**.

### Task 4: Working itinerary controls

**Files:**
- Create: `apps/web/src/lib/itinerary-edits.ts`
- Create: `apps/web/src/lib/itinerary-edits.test.ts`
- Modify: `apps/web/src/components/itinerary/itinerary-view.tsx`
- Modify: `apps/web/src/components/itinerary/itinerary-view.test.tsx`
- Modify: `apps/web/src/components/itinerary/saved-itinerary.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `shiftItemTime`, `removeItem`, `swapDestinationOrder`; controlled `ItineraryView` save callback.

- [x] **Step 1: Write failing pure-function and interaction tests** for +30 minutes, locked-item protection, route swap, save feedback and one-step undo.
- [x] **Step 2: Run targeted tests** and confirm expected failures.
- [x] **Step 3: Implement immutable edit functions and adjustment toolbar**.
- [x] **Step 4: Run all tests, typecheck and build**.

### Task 5: Browser and design verification

**Files:**
- Update only files required by discovered defects.
- Create local screenshots under `output/playwright/` during verification.

**Interfaces:**
- Produces: verified desktop and mobile local experience; no deployment.

- [x] **Step 1: Start local web and API services** and generate a customized trip.
- [x] **Step 2: Verify save, list, reopen, adjust, undo and delete** in a real browser.
- [x] **Step 3: Capture desktop and mobile screenshots** and compare with the PRD concept using `view_image`.
- [x] **Step 4: Fix visual or interaction defects, rerun checks, and stop local services**.
