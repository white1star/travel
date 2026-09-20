import { afterEach, expect, test, vi } from "vitest";

import { createLocalItinerary } from "./local-planner";
import type { TripDraft } from "./types";
import { requestAiItinerary } from "./ai-planner";

const draft: TripDraft = {
  mode: "known",
  origin: "南京",
  destinations: ["苏州"],
  dateMode: "flexible",
  startDate: "",
  days: 2,
  travelers: 2,
  budgetPerPerson: 3000,
  pace: "balanced",
  interests: ["博物馆"],
  requiredPlaces: [],
  returnToOrigin: true,
};

afterEach(() => vi.unstubAllGlobals());

test("AI 行程客户端只向本地后端发送结构化表单", async () => {
  const result = createLocalItinerary(draft);
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(requestAiItinerary(draft)).resolves.toEqual(result);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:8000/api/trips/generate-ai",
    expect.objectContaining({ method: "POST" }),
  );
  const options = fetchMock.mock.calls[0]![1]!;
  expect(JSON.parse(String(options.body))).toEqual(expect.objectContaining({
    origin: "南京",
    destinations: ["苏州"],
    date_mode: "flexible",
    budget_per_person: 3000,
  }));
});

test("AI 行程客户端保留后端的可读错误", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "AI 服务繁忙，请稍后重试。" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  })));

  await expect(requestAiItinerary(draft)).rejects.toThrow("AI 服务繁忙");
});
