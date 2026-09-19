import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CardReveal } from "./card-reveal";

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("没有动画 API 时入口仍然可见且可访问", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  render(<CardReveal><a href="/plan/new">开始旅行</a></CardReveal>);
  expect(screen.getByRole("link", { name: "开始旅行" })).toBeVisible();
});

test("卡片只入场一次，减少动态开启时中止动画，卸载时释放观察器", () => {
  let intersect: IntersectionObserverCallback = () => undefined;
  let preferenceChanged: () => void = () => undefined;
  const media = {
    matches: false,
    addEventListener: vi.fn((_event, callback) => { preferenceChanged = callback; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe = observer.observe;
    unobserve = observer.unobserve;
    disconnect = observer.disconnect;
  });
  const { unmount } = render(<CardReveal><a href="/trips">旅行列表</a></CardReveal>);
  const notify = (isIntersecting: boolean) => act(() => intersect([
    { isIntersecting } as IntersectionObserverEntry,
  ], observer as unknown as IntersectionObserver));
  notify(false);
  expect(animate).not.toHaveBeenCalled();
  notify(true);
  notify(true);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(observer.unobserve).toHaveBeenCalledTimes(1);
  media.matches = true;
  act(() => preferenceChanged());
  expect(cancel).toHaveBeenCalled();
  expect(screen.getByRole("link")).toBeVisible();
  unmount();
  expect(observer.disconnect).toHaveBeenCalled();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", preferenceChanged);
});

test("减少动态偏好下不观察或隐藏卡片", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const observe = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { observe = observe; });
  render(<CardReveal><button>打开行程</button></CardReveal>);
  expect(observe).not.toHaveBeenCalled();
  expect(screen.getByRole("button")).toBeVisible();
});
