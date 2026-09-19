export type Pace = "compact" | "balanced" | "relaxed";

export type BookingStatus = "planned" | "confirmed" | "cancelled";
export type TransportMode = "flight" | "train" | "coach" | "ferry" | "drive" | "other";
export type StayType = "hotel" | "homestay" | "hostel" | "friends" | "other";
export type CostScope = "per_person" | "total";
export type BudgetCategory = "transport" | "lodging" | "food" | "tickets" | "local_transport" | "other";
export type BudgetAllocations = Record<BudgetCategory, number>;

interface ReservationBase {
  id: string;
  status: BookingStatus;
  title: string;
  provider?: string;
  confirmation_number?: string;
  cost?: number;
  cost_scope?: CostScope;
  notes?: string;
}

export interface TransportReservation extends ReservationBase {
  kind: "transport";
  mode: TransportMode;
  departure_at: string;
  arrival_at: string;
  departure_place: string;
  arrival_place: string;
  service_number?: string;
}

export interface StayReservation extends ReservationBase {
  kind: "stay";
  stay_type: StayType;
  check_in_date: string;
  check_out_date: string;
  address?: string;
  contact?: string;
}

export type TravelReservation = TransportReservation | StayReservation;

export interface TripDraft {
  mode: "known" | "recommend";
  origin: string;
  destinations: string[];
  dateMode: "fixed" | "flexible";
  startDate: string;
  days: number;
  travelers: number;
  budgetPerPerson: number;
  pace: Pace;
  interests: string[];
  requiredPlaces: string[];
  returnToOrigin: boolean;
}

export interface ItineraryItem {
  time: string;
  end_time: string;
  name: string;
  category: string;
  duration_minutes: number;
  transport?: string | null;
  transport_minutes?: number | null;
  description: string;
  cost: number;
  locked: boolean;
  verified_hours: boolean;
  notice?: string | null;
  coordinate: [number, number];
  poi_id?: string;
  address?: string;
  citycode?: string;
  location_source?: "amap";
}

export interface ItineraryDay {
  day: number;
  date: string | null;
  city: string;
  title: string;
  intensity: "轻松" | "适中" | "紧凑";
  items: ItineraryItem[];
}

export interface Itinerary {
  id: string;
  title: string;
  travelers: number;
  route: string[];
  days: ItineraryDay[];
  budget: {
    total_available: number;
    estimated_total: number;
    remaining: number;
    transport: number;
    lodging: number;
    tickets: number;
    local_transport: number;
    food: number;
    other?: number;
    allocations?: BudgetAllocations;
  };
  generated_at: string;
  data_notice: string;
  reservations?: TravelReservation[];
}
