# 旅行规划网站 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一套可本地运行并可部署的旅行规划商业网站首版，贯通会员兑换、分步创建、行程生成、详情、保存、分享、导出和兑换码管理。

**Architecture:** 采用 `apps/web` 与 `apps/api` 分离结构。Next.js 负责响应式界面，FastAPI 负责身份、会员、行程和分享接口；开发阶段以 SQLite 与内存任务适配器保证开箱运行，生产配置切换 PostgreSQL、Redis/Celery 和正式外部服务适配器。

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, FastAPI, SQLAlchemy, Pydantic, PostgreSQL, Redis, Celery, Docker Compose, Pytest, Vitest

**Spec:** `docs/superpowers/specs/2026-09-12-travel-planner-design.md`

## Global Constraints

- 首版仅覆盖中国大陆城市。
- 所有演示数据必须显示为演示或待确认，不得伪装为实时库存或价格。
- 地点、地图、AI、微信、交通和酒店必须通过适配器接入。
- 会员到期后可读历史行程，不可创建或调整。
- 桌面端时间轴与地图并排，移动端无横向滚动。
- PRD 效果图是视觉基线：白底、深色正文、橙色强调。

---

### Task 1: 建立前后端工作区与健康检查

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `apps/web/**`, `apps/api/**`, `docker-compose.yml`, `.env.example`
- Test: `apps/web/src/app/page.test.tsx`, `apps/api/tests/test_health.py`

**Interfaces:**
- Produces: `GET /api/health -> {status: "ok"}` and a responsive web shell.

- [ ] 写健康检查与首页壳层的失败测试。
- [ ] 安装锁定依赖并确认测试先失败。
- [ ] 实现最小 Next.js 页面和 FastAPI 健康接口。
- [ ] 运行前后端测试、类型检查和生产构建。

### Task 2: 兑换码会员领域

**Files:**
- Create: `apps/api/app/models/**`, `apps/api/app/services/membership.py`, `apps/api/app/routers/auth.py`, `apps/api/app/routers/admin_codes.py`
- Test: `apps/api/tests/test_membership.py`, `apps/api/tests/test_admin_codes.py`

**Interfaces:**
- Produces: `redeem_code(user_id, code)`, `require_active_membership(user_id)`, code batch create/list/disable APIs.

- [ ] 写兑换成功、重复兑换、未到期再兑换、过期只读和停用码测试。
- [ ] 实现数据库模型、演示微信登录、会话与会员校验。
- [ ] 实现管理员批量生成、导出、查看和停用未兑换码接口。
- [ ] 运行领域与接口测试。

### Task 3: 分步创建与目的地推荐

**Files:**
- Create: `apps/web/src/app/plan/new/**`, `apps/web/src/components/planner/**`, `apps/web/src/lib/planner-schema.ts`
- Test: `apps/web/src/components/planner/planner-wizard.test.tsx`

**Interfaces:**
- Produces: `TripDraft` with origin, destinations, date mode, days, travelers, budget, pace, interests, required places and bookings.

- [ ] 写双入口、步骤校验、参考日期模式与多城市编辑测试。
- [ ] 实现首页和四步向导。
- [ ] 实现冲突提示与方案确认界面。
- [ ] 运行组件测试与移动端布局检查。

### Task 4: 行程生成与预算校验

**Files:**
- Create: `apps/api/app/domain/trips.py`, `apps/api/app/services/itinerary.py`, `apps/api/app/adapters/**`, `apps/api/app/routers/trips.py`
- Test: `apps/api/tests/test_itinerary.py`, `apps/api/tests/test_budget.py`

**Interfaces:**
- Produces: `POST /api/trips/generate`, `GET/PATCH/DELETE /api/trips/{id}` and versioned itinerary objects.

- [ ] 写会员拦截、地点真实性、锁定项、时间冲突、预算分类和降级标识测试。
- [ ] 实现地图与 AI 演示适配器以及确定性苏杭样例生成器。
- [ ] 实现行程保存、复制、删除、版本与撤销一次。
- [ ] 运行接口测试并验证错误响应。

### Task 5: 时间轴、地图与调整体验

**Files:**
- Create: `apps/web/src/app/trips/[id]/**`, `apps/web/src/components/itinerary/**`, `apps/web/src/components/map/**`
- Test: `apps/web/src/components/itinerary/itinerary-view.test.tsx`

**Interfaces:**
- Consumes: itinerary objects from Task 4.
- Produces: synchronized timeline/map selection and adjustment confirmation UI.

- [ ] 写桌面/移动布局、地点选择、锁定提示与影响确认测试。
- [ ] 还原 PRD 中桌面双栏和移动单栏详情页。
- [ ] 实现增删替换、改时间和自然语言调整入口。
- [ ] 实现费用摘要、数据更新时间和待确认标识。

### Task 6: 我的行程、分享与 PDF

**Files:**
- Create: `apps/api/app/routers/shares.py`, `apps/web/src/app/trips/**`, `apps/web/src/app/s/[token]/**`, `apps/web/src/styles/print.css`
- Test: `apps/api/tests/test_shares.py`, `apps/web/src/app/s/share-page.test.tsx`

**Interfaces:**
- Produces: public/password/private share policies, revocable tokens, browser print-to-PDF layout.

- [ ] 写三种分享权限、密码校验、撤销和只读测试。
- [ ] 实现我的行程列表与分享设置。
- [ ] 实现只读分享页与打印样式。
- [ ] 验证 PDF 打印预览与移动端页面。

### Task 7: 登录兑换页与管理后台

**Files:**
- Create: `apps/web/src/app/login/**`, `apps/web/src/app/redeem/**`, `apps/web/src/app/admin/**`
- Test: `apps/web/src/app/redeem/redeem.test.tsx`, `apps/web/src/app/admin/admin.test.tsx`

**Interfaces:**
- Consumes: Task 2 auth and admin endpoints.
- Produces: demo-to-WeChat replaceable login UI and complete code operations UI.

- [ ] 写登录状态、兑换错误、会员期限和后台表格交互测试。
- [ ] 实现微信扫码视觉与开发环境演示登录。
- [ ] 实现兑换页、会员状态和管理员码表页面。
- [ ] 运行测试并检查无权限状态。

### Task 8: 部署、风控与端到端验收

**Files:**
- Create: `apps/web/Dockerfile`, `apps/api/Dockerfile`, `infra/nginx.conf`, `README.md`, `tests/e2e/**`
- Test: `tests/e2e/travel-flow.spec.ts`

**Interfaces:**
- Produces: one-command local startup and deployment baseline.

- [ ] 实现按用户与 IP 的生成/调整限流和审计字段。
- [ ] 完成 Docker Compose、环境变量说明和健康检查。
- [ ] 执行登录、兑换、创建、生成、分享、到期只读的端到端流程。
- [ ] 运行全量测试、类型检查、构建与响应式视觉检查。

