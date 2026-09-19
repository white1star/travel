# 旅行规划核心第一版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成“输入旅行需求并生成可照着走的行程”的可运行第一版。

**Architecture:** Next.js 提供首页、四步向导与行程详情；FastAPI 接收结构化需求并通过可替换的演示规划器返回稳定行程。第一版使用浏览器本地存储保存草稿和结果，地图区域用与真实地图适配器同结构的路线画布呈现。

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, FastAPI, Pydantic, Vitest, Pytest

**Spec:** `docs/superpowers/specs/2026-09-12-travel-planner-design.md`

## Global Constraints

- 仅实现规划核心闭环，不接入正式微信、兑换码、地图或 AI 密钥。
- 所有演示信息明确标注为示例或待确认。
- 白色背景、深色正文、橙色强调；桌面双栏、移动单栏。
- 地点与行程数据通过适配器边界组织，后续可直接替换正式服务。

---

### Task 1: 可运行工程与健康检查

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `apps/web/**`, `apps/api/**`
- Test: `apps/web/src/app/page.test.tsx`, `apps/api/tests/test_health.py`

**Interfaces:**
- Produces: `GET /api/health` and homepage render contract.

- [x] 先写首页和健康检查测试。
- [x] 运行并确认因实现缺失而失败。
- [x] 实现最小应用壳层与健康接口。
- [x] 运行测试并确认通过。

### Task 2: 旅行需求模型与演示规划器

**Files:**
- Create: `apps/api/app/schemas.py`, `apps/api/app/planner.py`, `apps/api/app/main.py`
- Test: `apps/api/tests/test_planner.py`

**Interfaces:**
- Consumes: `TripRequest`.
- Produces: `POST /api/trips/generate -> Itinerary`.

- [x] 先写往返、多城市、预算、锁定地点和待确认标记测试。
- [x] 运行并确认因规划器缺失而失败。
- [x] 实现确定性的国内示例规划器和接口。
- [x] 运行 API 全量测试。

### Task 3: 首页与四步创建向导

**Files:**
- Create: `apps/web/src/components/planner/**`, `apps/web/src/app/plan/new/page.tsx`
- Test: `apps/web/src/components/planner/planner-wizard.test.tsx`

**Interfaces:**
- Produces: validated `TripDraft`, submitted to `/api/trips/generate`.

- [x] 先写双入口、步骤切换和必填校验测试。
- [x] 运行并确认失败。
- [x] 实现首页、进度导航、表单与生成状态。
- [x] 运行组件测试。

### Task 4: 行程时间轴与路线画布

**Files:**
- Create: `apps/web/src/components/itinerary/**`, `apps/web/src/app/trips/demo/page.tsx`
- Test: `apps/web/src/components/itinerary/itinerary-view.test.tsx`

**Interfaces:**
- Consumes: `Itinerary`.
- Produces: synchronized day tabs, timeline selection and route markers.

- [x] 先写日程字段、地点选择和预算摘要测试。
- [x] 运行并确认失败。
- [x] 实现桌面双栏和移动单栏详情。
- [x] 运行测试、类型检查、构建与浏览器视觉检查。
