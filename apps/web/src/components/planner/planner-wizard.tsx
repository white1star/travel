"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPinned, Sparkles } from "lucide-react";

import { requestAiItinerary } from "@/lib/ai-planner";
import { createLocalItinerary, type LocalPlanResult } from "@/lib/local-planner";
import {
  clearPlannerDraft,
  clearPlannerPreview,
  readPlannerDraft,
  readPlannerPreview,
  writePlannerDraft,
  writePlannerPreview,
  type PlannerPreviewRecord,
} from "@/lib/planner-preview-store";
import { saveTrip } from "@/lib/travel-store";
import type { Itinerary, Pace, TripDraft } from "@/lib/types";
import { ItineraryPreview } from "./itinerary-preview";

const interests = ["园林古迹", "博物馆", "自然风景", "特色美食", "城市漫步", "亲子体验"];
const paceOptions: Array<{ value: Pace; label: string; detail: string }> = [
  { value: "compact", label: "紧凑", detail: "每天 4–5 个安排" },
  { value: "balanced", label: "适中", detail: "每天 3–4 个安排" },
  { value: "relaxed", label: "轻松", detail: "每天 2–3 个安排" },
];

const initialDraft: TripDraft = {
  mode: "known",
  origin: "",
  destinations: [],
  dateMode: "flexible",
  startDate: "",
  days: 0,
  travelers: 0,
  budgetPerPerson: 0,
  pace: "balanced",
  interests: [],
  requiredPlaces: [],
  returnToOrigin: false,
};

function uniqueTextList(value: string) {
  return [...new Set(value.split(/[、,，]/).map(item => item.trim()).filter(Boolean))];
}

type PlannerWizardProps = {
  onSave?: (itinerary: Itinerary) => void;
  navigate?: (href: string) => void;
  generateAiPlan?: (draft: TripDraft) => Promise<LocalPlanResult>;
};

export function PlannerWizard({
  onSave = saveTrip,
  navigate = href => window.location.assign(href),
  generateAiPlan = requestAiItinerary,
}: PlannerWizardProps = {}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [destinationText, setDestinationText] = useState("");
  const [requiredText, setRequiredText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generationMode, setGenerationMode] = useState<"ai" | "local" | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [persistenceWarning, setPersistenceWarning] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [preview, setPreview] = useState<PlannerPreviewRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const saveGuard = useRef(false);

  useEffect(() => {
    let recovered = initialDraft;
    let recoveredStatus = "";
    try {
      const saved = readPlannerDraft();
      if (saved) {
        recovered = saved.draft;
        setDestinationText(saved.destinationText);
        setRequiredText(saved.requiredText);
        recoveredStatus = "已恢复未完成的草稿";
        setStep(saved.step);
      }
    } catch { recoveredStatus = "草稿无法读取，可以继续填写"; }

    const query = new URLSearchParams(window.location.search);
    const destination = query.get("destination")?.trim().slice(0, 100);
    const days = Number(query.get("days"));
    const pace = query.get("pace");
    const validDays = Number.isInteger(days) && days >= 1 && days <= 30;
    const validPace = pace === "compact" || pace === "balanced" || pace === "relaxed";
    const hasQuickPlan = Boolean(destination) || validDays || validPace;

    if (hasQuickPlan) {
      try { clearPlannerPreview(); }
      catch { setPersistenceWarning("旧预览无法从浏览器清除，但本次填写不受影响。"); }
      setStep(0);
      if (destination) setDestinationText(destination);
      setDraft({
        ...recovered,
        ...(destination ? { mode: "known", destinations: uniqueTextList(destination) } : {}),
        ...(validDays ? { days } : {}),
        ...(validPace ? { pace } : {}),
      });
      setDraftStatus(recoveredStatus);
      setReady(true);
      return;
    }

    try {
      const savedPreview = readPlannerPreview();
      if (savedPreview) {
        setPreview(savedPreview);
        setDraft(savedPreview.draft);
        setDestinationText(savedPreview.draft.destinations.join("、"));
        setRequiredText(savedPreview.draft.requiredPlaces.join("、"));
        setStep(2);
        setDraftStatus("已恢复尚未保存的行程预览");
        setReady(true);
        return;
      }
    } catch {
      recoveredStatus = recoveredStatus
        ? `预览无法恢复，${recoveredStatus}`
        : "预览无法恢复，可以继续填写";
    }

    setDraft({
      ...recovered,
    });
    setDraftStatus(recoveredStatus);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { writePlannerDraft({ version: 1, draft, destinationText, requiredText, step: step as 0 | 1 | 2 }); }
    catch { setDraftStatus("浏览器无法保存草稿，离开前请完成创建"); }
  }, [ready, draft, destinationText, requiredText, step]);

  const reset = () => {
    setDraft({ ...initialDraft, destinations: [], interests: [], requiredPlaces: [] });
    setDestinationText(""); setRequiredText(""); setStep(0); setError(""); setConfirmReset(false); setPreview(null); setDraftStatus("已清空，可以重新填写");
    try { clearPlannerDraft(); clearPlannerPreview(); }
    catch { setPersistenceWarning("浏览器未能清除旧草稿，当前页面已重置。"); }
  };

  const validate = (includePreferences = true) => {
    if (!uniqueTextList(destinationText).length) return "请填写至少一个目的城市。";
    if (!draft.origin.trim()) return "请填写出发城市。";
    if (!Number.isInteger(draft.days) || draft.days < 1 || draft.days > 30) return "旅行天数应为 1–30 天。";
    if (!Number.isInteger(draft.travelers) || draft.travelers < 1 || draft.travelers > 20) return "同行人数应为 1–20 人。";
    if (includePreferences && (!Number.isFinite(draft.budgetPerPerson) || draft.budgetPerPerson < 0)) return "预算应为不小于零的金额，请返回旅行偏好修改。";
    if (draft.dateMode === "fixed") {
      const parsed = new Date(`${draft.startDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== draft.startDate) return "请选择有效的出发日期。";
    }
    return "";
  };

  const advance = (next: number) => {
    const issue = validate(next !== 1);
    setError(issue);
    if (!issue) setStep(next);
  };

  const toggleInterest = (interest: string) => {
    setDraft((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }));
  };

  const normalizedDraft = (): TripDraft => ({
    ...draft,
    origin: draft.origin.trim(),
    destinations: uniqueTextList(destinationText),
    requiredPlaces: uniqueTextList(requiredText),
  });

  const showPreview = (normalized: TripDraft, result: LocalPlanResult) => {
    const record: PlannerPreviewRecord = { version: 1, draft: normalized, ...result };
    setDraft(normalized);
    setDestinationText(normalized.destinations.join("、"));
    setRequiredText(normalized.requiredPlaces.join("、"));
    setPreview(record);
    try {
      writePlannerPreview(record);
      setPersistenceWarning("");
    } catch {
      setPersistenceWarning("预览已生成，但浏览器无法保存；刷新后可能无法恢复。请确认后尽快保存行程。");
    }
  };

  const generateLocal = () => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    setLoading(true);
    setGenerationMode("local");
    const normalized = normalizedDraft();
    setError("");
    const result = createLocalItinerary(normalized);
    showPreview(normalized, result);
    setLoading(false);
    setGenerationMode(null);
  };

  const generateAi = async () => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    setLoading(true);
    setGenerationMode("ai");
    setError("");
    const normalized = normalizedDraft();
    try {
      showPreview(normalized, await generateAiPlan(normalized));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 行程生成失败，请重试或使用普通生成。");
    } finally {
      setLoading(false);
      setGenerationMode(null);
    }
  };

  const backToEdit = () => {
    setPreview(null);
    setStep(0);
    setError("");
    try {
      clearPlannerPreview();
      setPersistenceWarning("");
    } catch { setPersistenceWarning("旧预览无法从浏览器清除，再次生成仍会覆盖它。"); }
  };

  const confirmSave = async () => {
    if (!preview || saveGuard.current) return;
    saveGuard.current = true;
    setSaving(true);
    setError("");
    await Promise.resolve();
    try {
      onSave(preview.itinerary);
    } catch {
      setError("行程未保存，请检查浏览器存储空间或权限后重试。当前预览仍然保留。");
      setSaving(false);
      saveGuard.current = false;
      return;
    }
    try { clearPlannerPreview(); clearPlannerDraft(); }
    catch { setPersistenceWarning("行程已保存，但旧创建缓存未能清除；再次保存仍会更新同一行程。"); }
    navigate("/trips/demo");
  };

  if (preview) {
    return (
      <section className="wizard-shell wizard-shell--preview">
        {draftStatus && <p className="draft-status" role="status">{draftStatus}</p>}
        {persistenceWarning && <p className="draft-status" role="status">{persistenceWarning}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <ItineraryPreview value={preview} saving={saving} onBack={backToEdit} onSave={() => { void confirmSave(); }} />
      </section>
    );
  }

  return (
    <section className="wizard-shell">
      <div className="wizard-draft-tools"><small>填写内容自动保存在当前浏览器</small><button className="button button--ghost" disabled={!ready || loading} onClick={() => setConfirmReset(true)}>清空重填</button></div>
      {draftStatus && <p className="draft-status" role="status">{draftStatus}</p>}
      {persistenceWarning && <p className="draft-status" role="status">{persistenceWarning}</p>}
      {confirmReset && <section className="library-action-panel" aria-label="清空草稿确认"><strong>清空当前填写内容？已保存的行程不受影响。</strong><div className="library-actions"><button className="button button--primary" disabled={loading} onClick={reset}>确认清空草稿</button><button className="button button--ghost" onClick={() => setConfirmReset(false)}>取消</button></div></section>}
      <fieldset className="wizard-fields" disabled={!ready || loading}>
      <div className="wizard-progress" aria-label="创建进度">
        {["基本信息", "旅行偏好", "确认生成"].map((label, index) => (
          <div className={index <= step ? "wizard-progress__item is-active" : "wizard-progress__item"} key={label}>
            <span>{index + 1}</span><b>{label}</b>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="wizard-panel">
          <div className="wizard-title"><CalendarDays size={22} /><div><h1>从哪里出发？</h1><p>填好目的地、时间和人数就能开始，偏好可以稍后补充。</p></div></div>
          <div className="form-grid">
            <label className="field"><span>出发城市</span><input aria-label="出发城市" value={draft.origin} onChange={(event) => setDraft({ ...draft, origin: event.target.value })} /></label>
            <label className="field field--wide"><span>{draft.mode === "recommend" ? "推荐目的地" : "目的城市"}</span><input aria-label="目的城市" value={destinationText} onChange={(event) => setDestinationText(event.target.value)} /><small>多个城市用顿号分隔；苏州和杭州有本地点位，其他城市会保留为待完善行程。</small></label>
            <div className="field field--wide"><span>出发日期</span><div className="segmented"><button aria-pressed={draft.dateMode === "fixed"} onClick={() => setDraft({ ...draft, dateMode: "fixed" })}>日期已定</button><button aria-pressed={draft.dateMode === "flexible"} onClick={() => setDraft({ ...draft, dateMode: "flexible" })}>日期未定</button></div></div>
            {draft.dateMode === "fixed" && <label className="field"><span>出发日期</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>}
            <label className="field"><span>旅行天数</span><input type="number" min={1} max={30} value={draft.days || ""} onChange={(event) => setDraft({ ...draft, days: Number(event.target.value) })} /></label>
            <label className="field"><span>同行人数</span><input type="number" min={1} max={20} value={draft.travelers || ""} onChange={(event) => setDraft({ ...draft, travelers: Number(event.target.value) })} /></label>
            <label className="check-row field--wide"><input type="checkbox" checked={draft.returnToOrigin} onChange={(event) => setDraft({ ...draft, returnToOrigin: event.target.checked })} /><span>旅行结束后返回出发城市</span></label>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="wizard-panel">
          <div className="wizard-title"><Sparkles size={22} /><div><h1>这趟旅行想怎么玩？</h1><p>节奏控制每天安排数量，兴趣决定地点优先级，必去地点会优先保留。</p></div></div>
          <div className="field field--wide"><span>旅行节奏</span><div className="pace-options">{paceOptions.map((option) => <button key={option.value} aria-label={option.label} aria-pressed={draft.pace === option.value} onClick={() => setDraft({ ...draft, pace: option.value })}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></div>
          <div className="field field--wide"><span>感兴趣的体验</span><div className="interest-options">{interests.map((interest) => <button key={interest} aria-pressed={draft.interests.includes(interest)} onClick={() => toggleInterest(interest)}>{interest}</button>)}</div></div>
          <div className="form-grid form-grid--spaced">
            <label className="field"><span>每人预算</span><div className="input-with-unit"><input type="number" min={0} value={draft.budgetPerPerson || ""} onChange={(event) => setDraft({ ...draft, budgetPerPerson: Number(event.target.value) })} /><b>元</b></div></label>
            <label className="field"><span>必须去的地点</span><input value={requiredText} onChange={(event) => setRequiredText(event.target.value)} /><small>地图服务接入前，未收录的地点不会自动定位，请在行程中手动补充。</small></label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel confirm-panel">
          <div className="wizard-title"><MapPinned size={22} /><div><h1>确认后生成预览</h1><p>系统会根据节奏、兴趣、必去地点和预算先生成一份预览，确认后才保存。</p></div></div>
          <dl className="trip-summary">
            <div><dt>路线</dt><dd>{draft.origin} → {destinationText.replaceAll("、", " → ")} {draft.returnToOrigin ? `→ ${draft.origin}` : ""}</dd></div>
            <div><dt>时间</dt><dd>{draft.dateMode === "fixed" ? `${draft.startDate} 出发` : "日期未定 · 参考方案"}，共 {draft.days} 天</dd></div>
            <div><dt>同行</dt><dd>{draft.travelers} 人，人均预算 ¥{draft.budgetPerPerson.toLocaleString()}</dd></div>
            <div><dt>偏好</dt><dd>{paceOptions.find((item) => item.value === draft.pace)?.label} · {draft.interests.join("、")}</dd></div>
          </dl>
          <div className="library-actions"><button className="button button--ghost" onClick={() => { setStep(0); setError(""); }}>修改基本信息</button><button className="button button--ghost" onClick={() => { setStep(1); setError(""); }}>修改旅行偏好</button></div>
          <p className="data-warning">苏州、杭州使用本地点位目录；未知城市和地点不会被编造，将明确标记“待定位”或“待完善”。</p>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="wizard-actions">
        <button className="button button--ghost" disabled={step === 0 || loading} onClick={() => { setStep(step - 1); setError(""); }}><ArrowLeft size={17} />上一步</button>
        {step === 0 && <button className="button button--ghost" onClick={() => advance(2)}>直接确认</button>}
        {step < 2 ? <button className="button button--primary" onClick={() => advance(step + 1)}>下一步<ArrowRight size={17} /></button> : <><button className="button button--ghost" disabled={loading} onClick={generateLocal}>{loading && generationMode === "local" ? "生成中…" : "普通生成"}</button><button className="button button--primary" disabled={loading} onClick={() => { void generateAi(); }}>{loading && generationMode === "ai" ? "AI 规划中…" : "AI 生成行程"}<Sparkles size={17} /></button></>}
      </div>
      </fieldset>
    </section>
  );
}
