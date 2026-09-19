import type { Itinerary } from "./types";

export const DEMO_ITINERARY: Itinerary = {
  id: "demo-suhang",
  title: "苏杭四日游",
  travelers: 2,
  route: ["南京", "苏州", "杭州", "南京"],
  generated_at: "2026-09-12T09:00:00+08:00",
  data_notice: "当前为演示规划，营业时间与票价需在出发前确认。",
  budget: {
    total_available: 6000,
    estimated_total: 4280,
    remaining: 1720,
    transport: 900,
    lodging: 1380,
    tickets: 240,
    local_transport: 320,
    food: 1440,
  },
  days: [
    {
      day: 1,
      date: "2026-10-02",
      city: "苏州",
      title: "苏州 · 初见古城",
      intensity: "适中",
      items: [
        { time: "08:00", end_time: "09:35", name: "南京 → 苏州", category: "城际交通", duration_minutes: 95, transport: "高铁", transport_minutes: 95, description: "建议选择上午抵达的车次，实际班次与票价需查询确认。", cost: 180, locked: false, verified_hours: false, notice: "需出发前确认", coordinate: [120.5853, 31.2989] },
        { time: "10:00", end_time: "11:30", name: "拙政园", category: "园林", duration_minutes: 90, description: "中国四大名园之一，园林空间层次丰富，建议预留完整上午。", cost: 80, locked: true, verified_hours: true, coordinate: [120.6295, 31.324] },
        { time: "13:30", end_time: "15:30", name: "苏州博物馆", category: "博物馆", duration_minutes: 120, transport: "步行", transport_minutes: 8, description: "贝聿铭设计的新馆与忠王府相连，预约规则需出发前确认。", cost: 0, locked: false, verified_hours: false, notice: "需出发前确认", coordinate: [120.6277, 31.3241] },
        { time: "16:10", end_time: "17:30", name: "平江路", category: "街区", duration_minutes: 80, transport: "步行", transport_minutes: 20, description: "沿河步行体验苏州古城肌理，适合傍晚慢行。", cost: 0, locked: false, verified_hours: true, coordinate: [120.6334, 31.3115] },
      ],
    },
    {
      day: 2,
      date: "2026-10-03",
      city: "苏州",
      title: "苏州 · 园林与水巷",
      intensity: "轻松",
      items: [
        { time: "09:30", end_time: "11:00", name: "留园", category: "园林", duration_minutes: 90, description: "以建筑空间处理见长，上午游览更从容。", cost: 55, locked: false, verified_hours: true, coordinate: [120.5922, 31.3171] },
        { time: "15:30", end_time: "18:00", name: "山塘街", category: "街区", duration_minutes: 150, transport: "公共交通", transport_minutes: 24, description: "串联古城水巷与夜景，可根据体力缩短停留时间。", cost: 0, locked: false, verified_hours: true, coordinate: [120.6048, 31.321] },
      ],
    },
    {
      day: 3,
      date: "2026-10-04",
      city: "杭州",
      title: "杭州 · 西湖慢行",
      intensity: "适中",
      items: [
        { time: "09:30", end_time: "12:00", name: "西湖", category: "自然风景", duration_minutes: 150, description: "沿湖安排步行与休息，避免在一天内反复折返。", cost: 0, locked: false, verified_hours: true, coordinate: [120.1487, 30.245] },
        { time: "14:30", end_time: "16:30", name: "中国丝绸博物馆", category: "博物馆", duration_minutes: 120, transport: "公共交通", transport_minutes: 25, description: "系统了解丝绸文化，开放安排需出发前再次确认。", cost: 0, locked: false, verified_hours: false, notice: "需出发前确认", coordinate: [120.145, 30.226] },
      ],
    },
    {
      day: 4,
      date: "2026-10-05",
      city: "杭州",
      title: "杭州 · 山林与返程",
      intensity: "适中",
      items: [
        { time: "08:30", end_time: "11:00", name: "灵隐寺", category: "人文古迹", duration_minutes: 150, description: "位于西湖西侧山林，建议早间前往并预留排队时间。", cost: 75, locked: false, verified_hours: false, notice: "需出发前确认", coordinate: [120.1014, 30.24] },
        { time: "15:30", end_time: "17:20", name: "杭州 → 南京", category: "城际交通", duration_minutes: 110, transport: "高铁", transport_minutes: 110, description: "预留前往车站和安检时间，实际班次需确认。", cost: 220, locked: false, verified_hours: false, notice: "需出发前确认", coordinate: [120.214, 30.246] },
      ],
    },
  ],
};
