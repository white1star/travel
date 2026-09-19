"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Itinerary } from "@/lib/types";

export type SaveState = "saved" | "dirty" | "saving" | "failed";

type Options = {
  itinerary: Itinerary;
  onSave?: (value: Itinerary) => void | Promise<void>;
  initiallySaved: boolean;
  autosaveBlocked: boolean;
};

function snapshot(value: Itinerary) {
  return JSON.stringify(value);
}

export function useItineraryEditor({ itinerary, onSave, initiallySaved, autosaveBlocked }: Options) {
  const [current, setCurrent] = useState(itinerary);
  const [history, setHistory] = useState<Itinerary[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() => initiallySaved ? snapshot(itinerary) : null);
  const [saveState, setSaveState] = useState<SaveState>(() => initiallySaved ? "saved" : "dirty");
  const currentRef = useRef(current);
  const onSaveRef = useRef(onSave);
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  currentRef.current = current;
  onSaveRef.current = onSave;
  const currentSnapshot = snapshot(current);
  const hasUnsaved = savedSnapshot !== currentSnapshot;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    clearTimer();
    currentRef.current = itinerary;
    revisionRef.current += 1;
    setCurrent(itinerary);
    setHistory([]);
    setSavedSnapshot(initiallySaved ? snapshot(itinerary) : null);
    setSaveState(initiallySaved ? "saved" : "dirty");
  }, [clearTimer, initiallySaved, itinerary]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const commit = useCallback((next: Itinerary) => {
    setCurrent((previous) => {
      if (next === previous || snapshot(next) === snapshot(previous)) return previous;
      setHistory((items) => [...items, structuredClone(previous)].slice(-20));
      currentRef.current = next;
      revisionRef.current += 1;
      setSaveState("dirty");
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      const restored = structuredClone(previous);
      currentRef.current = restored;
      revisionRef.current += 1;
      setCurrent(restored);
      setSaveState("dirty");
      return items.slice(0, -1);
    });
  }, []);

  const persist = useCallback(async (value: Itinerary) => {
    const save = onSaveRef.current;
    if (!save) return;
    const valueSnapshot = snapshot(value);
    const startedRevision = revisionRef.current;
    setSaveState("saving");
    try {
      await save(structuredClone(value));
      setSavedSnapshot(valueSnapshot);
      setSaveState(revisionRef.current === startedRevision && snapshot(currentRef.current) === valueSnapshot ? "saved" : "dirty");
    } catch {
      setSaveState(revisionRef.current === startedRevision ? "failed" : "dirty");
    }
  }, []);

  const saveNow = useCallback(() => {
    clearTimer();
    void persist(currentRef.current);
  }, [clearTimer, persist]);

  useEffect(() => {
    clearTimer();
    if (!onSave || autosaveBlocked || !hasUnsaved || saveState !== "dirty") return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(currentRef.current);
    }, 600);
    return clearTimer;
  }, [autosaveBlocked, clearTimer, currentSnapshot, hasUnsaved, onSave, persist, saveState]);

  const statusMessage = !onSave
    ? "预览模式"
    : saveState === "saving"
      ? "正在保存…"
      : saveState === "failed"
        ? "自动保存失败，修改仍保留"
        : saveState === "dirty"
          ? autosaveBlocked ? "有未确认的编辑，暂未自动保存" : "未保存"
          : "已自动保存";

  return {
    current,
    commit,
    undo,
    canUndo: history.length > 0,
    saveNow,
    saveState,
    hasUnsaved,
    statusMessage,
  };
}
