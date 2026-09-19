# 高德地图接入

本轮实现：同城地点搜索 → 选择真实地址 → 添加/替换当天安排 → 保存地点 ID、地址与 GCJ-02 坐标 → 地图标点 → 计算相邻两站的步行、驾车或公交路线。

首页未改动，不自动部署。首次整趟自动生成仍使用项目内的本地规则；行程详情的“当前天 AI 推荐”会从高德 Web 服务构建真实候选池，再让 DeepSeek 只选择候选 ID 和安排时间，名称、地址、坐标、城市编码与分类始终由后端回填。地图与 AI 都不保证开放时间、实时酒店价格或车票库存，界面会明确标注待核验信息。

## 配置

1. 高德开放平台创建应用，申请 **Web 服务 API Key**，以及 **Web 端 JS API Key + 安全密钥**。
2. 将 `apps/api/.env.example` 复制为 `apps/api/.env.local`，在本地填写三个值。真实文件已被忽略，不上传、不发到聊天里。
3. 在 JS Key 控制台按官方要求配置域名白名单（本地预览地址和正式域名），按 Web 服务 Key 的安全设置限制服务器 IP。商业使用确认授权、额度、搜索服务权限及数据存储政策。
4. 从 `apps/api` 启动后端：

```powershell
& '..\..\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --env-file .env.local
```

5. 本地 127.0.0.1 / localhost 默认连接同名主机 8000 端口。正式站点必须设置前端 `NEXT_PUBLIC_API_BASE_URL` 为可访问的 HTTPS 后端地址，并重新构建；未配置时不请求用户电脑上的 localhost。前端配置示例见 `apps/web/.env.example`。
6. 修改后端环境变量需重启服务。访问 `/api/maps/status` 检查 `search_available` / `map_available`；状态接口只检查配置存在性。2026-09-19 已在本地完成真实地点搜索和步行路线冒烟，生产域名与生产额度仍需独立验证。

AI 推荐还需要在同一份后端 `.env.local` 中配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 和 `DEEPSEEK_TIMEOUT_SECONDS`。推荐接口为 `POST /api/recommendations/day`；一次生成会按景点、博物馆、公园、特色美食及最多一个用户短查询请求高德，因此会额外消耗约 4–5 次地点检索额度。

## 安全与失败行为

- Web 服务 Key 和 JS 安全密钥仅放后端。浏览器 JS Key 是公开标识，不能当作服务密钥。
- JS API 使用官方 `serviceHost` 代理方式。`/_AMapService/v4/map/styles`（及 texture）只转发到高德指定样式域名，不是任意 URL 或地点搜索代理。
- 地点搜索和路径规划使用我们校验输入后的 `/api/maps/places` 与 `/api/maps/route`；有超时和每 IP 每进程每分钟 60 次的基础限流。
- 公交规划需要搜索结果中的 citycode；缺少编码时提示重新选择地点。
- 仅来源为高德的有效地点参与真实地图和路线，不拿旧演示坐标、未知地点、手动名称或 `[0,0]` 冒充定位。
- 路线只计算相邻两个已定位安排；不能越过未定位安排直接连线。切换方式、路段或修改安排后清除旧计算结果，需要重新计算。
- 搜索无结果、服务错误、未配置、地图加载失败分别提示；手动添加、编辑和保存仍可用。规划服务异常不再静默回退为演示行程。
- 预计耗时为请求时的估算，不保证未来班次、路况或实际抵达。未获取完整几何信息时不绘制假路线。
- AI 临时要求最长 300 字并按不可信文本处理；DeepSeek 不能提供地点字段，虚构或重复候选 ID、非法时间、跨午夜安排和异常 JSON 会被后端拒绝。推荐接口另有每 IP 每进程每分钟 6 次的基础限流。
- 模型或地图失败只影响推荐面板；输入会保留并允许重试。模型偶发返回截断或异常 JSON 时后端最多自动重试一次，不会无限调用。

## 正式上线前

- 本轮密钥曾通过聊天截图提供，仅限本地联调；正式上线前必须在高德控制台轮换，并重新配置域名白名单、服务端出口 IP 和额度告警。
- DeepSeek Key 也曾在聊天中提供，正式上线前必须在 DeepSeek 控制台轮换；生产环境只通过秘密管理服务注入，禁止进入前端变量、源码、日志或构建产物。
- 验证新生产 Key 的 POI 搜索、底图加载、样式代理、三种路线接口及生产域名授权。本地开发 Key 的实网联调结果不能替代生产验收。
- HTTPS 后端需常驻运行；Netlify 静态导出不会自动托管此 Python 服务，也不会因此获得地图能力。
- 增加账号鉴权、全局配额控制、共享限流（当前限流不跨进程）、监控与告警；评估代理出口 IP 和成本。
- 地点与地图数据的缓存、长期保存、导出和再分发遵循服务协议；不把搜索响应整个保存为自建 POI 数据库。
- 保留高德 SDK 的版权和审图信息，勿遮挡；建立配置失败与费用超额的降级方案。

官方文档：

- https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
- https://developer.amap.com/api/webservice/guide/api-advanced/newpoisearch
- https://developer.amap.com/api/webservice/guide/api/newroute
- https://developer.amap.com/upgrade
