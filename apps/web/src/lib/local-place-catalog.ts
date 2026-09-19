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

const LOCAL_PLACES: LocalPlace[] = [
  {
    id: "suzhou-humble-administrators-garden",
    city: "苏州",
    name: "拙政园",
    category: "园林",
    interests: ["园林古迹", "城市漫步"],
    suggestedDurationMinutes: 90,
    estimatedCostPerPerson: 80,
    description: "中国四大名园之一，园林空间层次丰富，建议预留完整上午。",
    coordinate: [120.6295, 31.324],
    verifiedHours: false,
  },
  {
    id: "suzhou-museum",
    city: "苏州",
    name: "苏州博物馆",
    category: "博物馆",
    interests: ["博物馆", "园林古迹"],
    suggestedDurationMinutes: 120,
    estimatedCostPerPerson: 0,
    description: "贝聿铭设计的新馆与忠王府相连，预约规则需出发前确认。",
    coordinate: [120.6277, 31.3241],
    verifiedHours: false,
  },
  {
    id: "suzhou-pingjiang-road",
    city: "苏州",
    name: "平江路",
    category: "街区",
    interests: ["城市漫步", "特色美食"],
    suggestedDurationMinutes: 80,
    estimatedCostPerPerson: 0,
    description: "沿河步行体验苏州古城肌理，适合傍晚慢行。",
    coordinate: [120.6334, 31.3115],
    verifiedHours: false,
  },
  {
    id: "suzhou-lingering-garden",
    city: "苏州",
    name: "留园",
    category: "园林",
    interests: ["园林古迹", "城市漫步"],
    suggestedDurationMinutes: 90,
    estimatedCostPerPerson: 55,
    description: "以建筑空间处理见长，园内空间紧凑而富于变化。",
    coordinate: [120.5922, 31.3171],
    verifiedHours: false,
  },
  {
    id: "suzhou-shantang-street",
    city: "苏州",
    name: "山塘街",
    category: "街区",
    interests: ["城市漫步", "特色美食"],
    suggestedDurationMinutes: 150,
    estimatedCostPerPerson: 0,
    description: "串联古城水巷与夜景，可根据体力缩短停留时间。",
    coordinate: [120.6048, 31.321],
    verifiedHours: false,
  },
  {
    id: "hangzhou-west-lake",
    city: "杭州",
    name: "西湖",
    category: "自然风景",
    interests: ["自然风景", "城市漫步", "亲子体验"],
    suggestedDurationMinutes: 150,
    estimatedCostPerPerson: 0,
    description: "沿湖安排步行与休息，避免在一天内反复折返。",
    coordinate: [120.1487, 30.245],
    verifiedHours: false,
  },
  {
    id: "hangzhou-china-silk-museum",
    city: "杭州",
    name: "中国丝绸博物馆",
    category: "博物馆",
    interests: ["博物馆", "亲子体验"],
    suggestedDurationMinutes: 120,
    estimatedCostPerPerson: 0,
    description: "系统了解丝绸文化，开放与预约安排需出发前确认。",
    coordinate: [120.145, 30.226],
    verifiedHours: false,
  },
  {
    id: "hangzhou-lingyin-temple",
    city: "杭州",
    name: "灵隐寺",
    category: "人文古迹",
    interests: ["园林古迹", "自然风景"],
    suggestedDurationMinutes: 150,
    estimatedCostPerPerson: 75,
    description: "位于西湖西侧山林，建议早间前往并预留排队时间。",
    coordinate: [120.1014, 30.24],
    verifiedHours: false,
  },
];

function clonePlace(place: LocalPlace): LocalPlace {
  return {
    ...place,
    interests: [...place.interests],
    coordinate: place.coordinate ? [...place.coordinate] : undefined,
  };
}

export function getLocalPlaces(city: string): LocalPlace[] {
  return LOCAL_PLACES.filter(place => place.city === city).map(clonePlace);
}

export function findLocalPlace(name: string, city?: string): LocalPlace | undefined {
  const normalized = name.trim();
  const place = LOCAL_PLACES.find(candidate => candidate.name.localeCompare(normalized, "zh-CN") === 0
    && (city === undefined || candidate.city === city));
  return place ? clonePlace(place) : undefined;
}
