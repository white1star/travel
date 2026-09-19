"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Bus, ChevronRight, Clock3, Coins, Copy, Eraser, GripVertical, LockKeyhole, MapPin, RotateCcw, Save, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";

import { addItem, addRecommendedItems, analyzeDaySchedule, clearDayItems, duplicateDayItems, moveScheduleItem, normalizeDayTimes, replaceItem, removeItem, shiftItemTime, swapDestinationOrder, updateItemTiming } from "@/lib/itinerary-edits";
import { removeReservation, upsertReservation } from "@/lib/itinerary-reservations";
import { applyPerPersonAllocations, getPerPersonAllocations } from "@/lib/itinerary-budget";
import type { BudgetAllocations, Itinerary, TravelReservation } from "@/lib/types";
import { AiDayRecommendations } from "./ai-day-recommendations";
import { RouteMap } from "./route-map";
import { PlaceEditor } from "./place-editor";
import { TravelLogistics } from "./travel-logistics";
import { TravelBudget } from "./travel-budget";
import { useItineraryEditor } from "./use-itinerary-editor";

function formatDate(value: string | null) {
  if (!value) return "日期待定";
  const parsed = new Date(`${value}T00:00:00`);
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

export function ItineraryView({ itinerary, onSave, initiallySaved = true }: { itinerary: Itinerary; onSave?: (itinerary: Itinerary) => void; initiallySaved?: boolean }) {
  const [activeDay, setActiveDay] = useState(0);
  const [activeItem, setActiveItem] = useState(0);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<"add" | "replace" | null>(null);
  const [targetDay, setTargetDay] = useState("");
  const [workspace, setWorkspace] = useState<"schedule" | "logistics" | "budget">("schedule");
  const [reservationDraft, setReservationDraft] = useState<TravelReservation | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<BudgetAllocations | null>(null);
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const [dayTool, setDayTool] = useState<"copy" | "clear" | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const autosaveBlocked = reservationDraft !== null || budgetDraft !== null || editor !== null;
  const { current, commit, undo: undoEdit, canUndo, saveNow, saveState, hasUnsaved: editorUnsaved, statusMessage } = useItineraryEditor({ itinerary, onSave, initiallySaved, autosaveBlocked });
  const hasUnsaved = editorUnsaved || reservationDraft !== null || budgetDraft !== null;
  const day = current.days[activeDay];

  useEffect(() => {
    setActiveDay(0);
    setActiveItem(0);
    setEditor(null);
    setTargetDay("");
    setStatus("");
    setWorkspace("schedule");
    setReservationDraft(null);
    setBudgetDraft(null);
    setDragSource(null);
    setDragTarget(null);
    setDayTool(null);
    setDuplicateTarget("");
    setAiOpen(false);
  }, [itinerary, initiallySaved]);

  useEffect(() => {
    if (activeDay >= current.days.length) setActiveDay(Math.max(0, current.days.length - 1));
    const itemCount = current.days[activeDay]?.items.length ?? 0;
    if (activeItem >= itemCount) setActiveItem(Math.max(0, itemCount - 1));
  }, [activeDay, activeItem, current]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const warnLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!window.confirm("有未保存的修改。离开后这些修改将丢失，确定离开吗？")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", warnLink, true); };
  }, [hasUnsaved]);

  const chooseDay = (index: number) => {
    setActiveDay(index);
    setActiveItem(0);
    setEditor(null);
    setReservationDraft(null);
    setTargetDay("");
    setDragSource(null);
    setDragTarget(null);
    setDayTool(null);
    setAiOpen(false);
  };

  const shiftSelected = (minutes: number) => {
    const next = shiftItemTime(current, activeDay, activeItem, minutes);
    if (next === current) { setStatus("时间调整不能跨越午夜，请移动到其他日期。"); return; }
    const [hours, mins] = day.items[activeItem].time.split(":").map(Number);
    const shifted = hours * 60 + mins + minutes;
    const shiftedTime = `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
    const nextIndex = day.items.filter((item, index) => index !== activeItem && (item.time < shiftedTime || (item.time === shiftedTime && index < activeItem))).length;
    commit(next);
    setActiveItem(nextIndex);
    setEditor(null);
    setAiOpen(false);
  };

  const removeSelected = () => {
    setEditor(null);
    const next = removeItem(current, activeDay, activeItem);
    commit(next);
    setActiveItem((index) => Math.max(0, Math.min(index, (next.days[activeDay]?.items.length ?? 1) - 1)));
  };

  const undo = () => {
    if (!canUndo) return;
    undoEdit();
    setActiveDay(0);
    setActiveItem(0);
    setEditor(null);
    setTargetDay("");
    setStatus("已撤销上一步");
  };

  const save = () => {
    if (!onSave) { setStatus("当前为预览，请进入我的行程保存。"); return; }
    if (reservationDraft && budgetDraft) { setStatus("请先确认或取消正在编辑的交通住宿和预算。"); return; }
    if (reservationDraft) { setStatus("请先保存或取消正在编辑的交通住宿信息。"); return; }
    if (budgetDraft) { setStatus("请先确认或取消正在编辑的预算。"); return; }
    saveNow();
    setStatus("");
  };

  const reorder = () => {
    const next = swapDestinationOrder(current);
    commit(next);
    setActiveDay(0);
    setActiveItem(0);
    setEditor(null);
    setTargetDay("");
  };

  const hasReturn = current.route[0] === current.route.at(-1);
  const destinations = current.route.slice(1, hasReturn ? -1 : undefined);
  const canSwap = destinations.length === 2 && destinations[0] !== destinations[1];
  const selected = day.items[activeItem];
  const issues = useMemo(() => analyzeDaySchedule(day), [day]);
  const commitReservation = (value: TravelReservation) => {
    commit(upsertReservation(current, value));
    setReservationDraft(null);
  };
  const deleteReservation = (id: string) => {
    commit(removeReservation(current, id));
    setReservationDraft(null);
  };
  const commitBudget = () => {
    if (!budgetDraft) return;
    commit(applyPerPersonAllocations(current, budgetDraft));
    setBudgetDraft(null);
  };

  return (
    <main id="main-content" className="trip-page">
      <section className="trip-hero">
        <div>
          <h1>{current.title}</h1>
          <p>{formatDate(current.days[0]?.date)}–{formatDate(current.days.at(-1)?.date ?? null)} · {current.travelers} 人同行 · {day.intensity}</p>
        </div>
        <div className="trip-hero__actions">
          <span className={`save-indicator${hasUnsaved ? " is-dirty" : ""}`} aria-label="保存状态" aria-live="polite">{reservationDraft || budgetDraft ? "未保存 · 有未确认的编辑" : saveState === "failed" ? `未保存 · ${statusMessage}` : statusMessage}</span>
          <button className="button button--ghost" disabled={!canUndo} onClick={undo}><RotateCcw size={16} />撤销</button>
          <button className="button button--primary" aria-label="保存行程" onClick={save}><Save size={16} />{saveState === "failed" ? "重试保存" : "立即保存"}</button>
        </div>
      </section>

      {status && <p className="trip-status" role="status">{status}</p>}
      {!status && saveState === "failed" && <p className="form-error" role="alert">保存失败，请检查浏览器存储空间后重试。修改仍保留在当前页面。</p>}

      <div className="route-strip" aria-label="行程路线">
        <div className="route-cities">{current.route.map((city, index) => <span key={`${city}-${index}`}>{city}{index < current.route.length - 1 && <ChevronRight size={14} />}</span>)}</div>
        <button disabled={!canSwap} title={canSwap ? "交换两个目的城市" : "仅支持交换两个目的城市"} onClick={reorder}><SlidersHorizontal size={15} />修改顺序</button>
      </div>

      <div className="trip-workspace-tabs" role="tablist" aria-label="行程工作区">
        <button role="tab" aria-selected={workspace === "schedule"} onClick={() => { setWorkspace("schedule"); setDragSource(null); setDragTarget(null); }}>日程</button>
        <button role="tab" aria-selected={workspace === "logistics"} onClick={() => { setWorkspace("logistics"); setDragSource(null); setDragTarget(null); }}>交通住宿</button>
        <button role="tab" aria-selected={workspace === "budget"} onClick={() => { setWorkspace("budget"); setDragSource(null); setDragTarget(null); }}>预算</button>
      </div>

      <div hidden={workspace !== "schedule"}>

      <div className="day-tabs" role="tablist" aria-label="按天查看行程">
        {current.days.map((item, index) => (
          <button aria-selected={activeDay === index} key={item.day} onClick={() => chooseDay(index)} role="tab">D{item.day} {item.city}</button>
        ))}
      </div>

      <div className="day-toolbar" aria-label="当天工具">
        <button className="button button--ghost" disabled={!current.days.some((value, index) => index !== activeDay && value.city === day.city)} onClick={() => { setDayTool("copy"); setDuplicateTarget(""); }}><Copy size={15} />复制当天</button>
        <button className="button button--ghost" disabled={!day.items.some((item) => !item.locked)} onClick={() => setDayTool("clear")}><Eraser size={15} />清空普通安排</button>
      </div>

      {dayTool === "copy" && <section className="day-tool-panel" aria-label="复制当天确认">
        <div><strong>复制 D{day.day} 的安排</strong><p>相同地点会自动跳过，新增地点会计入计划支出。</p></div>
        <label><span>复制到</span><select aria-label="复制到日期" value={duplicateTarget} onChange={(event) => setDuplicateTarget(event.target.value)}><option value="">选择同城日期</option>{current.days.map((value, index) => index !== activeDay && value.city === day.city ? <option key={index} value={index}>D{value.day} {value.city}</option> : null)}</select></label>
        <div className="day-tool-panel__actions"><button className="button button--ghost" onClick={() => setDayTool(null)}>取消</button><button className="button button--primary" disabled={!duplicateTarget} onClick={() => { commit(duplicateDayItems(current, activeDay, Number(duplicateTarget))); setDayTool(null); setDuplicateTarget(""); }}>确认复制</button></div>
      </section>}

      {dayTool === "clear" && <section className="day-tool-panel" aria-label="清空当天确认">
        <div><strong>清空 D{day.day} 的普通安排？</strong><p>必去地点会保留，移除地点的费用将从计划支出中扣除。</p></div>
        <div className="day-tool-panel__actions"><button className="button button--ghost" onClick={() => setDayTool(null)}>取消</button><button className="button button--primary danger-action" onClick={() => { const next = clearDayItems(current, activeDay); commit(next); setActiveItem(0); setDayTool(null); }}>确认清空</button></div>
      </section>}

      {showAdjustments && selected && (
        <section className="adjust-panel" aria-label="行程调整">
          <div><small>正在调整</small><strong>{selected.name}</strong></div>
          <div className="adjust-panel__actions">
            <button aria-label="上移选中安排" disabled={activeItem === 0} onClick={() => { const target = activeItem - 1; commit(moveScheduleItem(current, { fromDayIndex: activeDay, fromItemIndex: activeItem, toDayIndex: activeDay, toItemIndex: target })); setActiveItem(target); }}><ArrowUp size={15} />上移</button>
            <button aria-label="下移选中安排" disabled={activeItem >= day.items.length - 1} onClick={() => { const target = activeItem + 1; commit(moveScheduleItem(current, { fromDayIndex: activeDay, fromItemIndex: activeItem, toDayIndex: activeDay, toItemIndex: target })); setActiveItem(target); }}><ArrowDown size={15} />下移</button>
            <button onClick={() => shiftSelected(-30)}>提前 30 分钟</button>
            <button onClick={() => shiftSelected(30)}>延后 30 分钟</button>
            <button onClick={() => { commit(normalizeDayTimes(current, activeDay)); setActiveItem(0); }}>自动重新排程</button>
            <button disabled={selected.locked} onClick={() => setEditor("replace")}>替换地点</button>
            <label className="move-control"><span>移动到日期</span><select aria-label="移动到日期" value={targetDay} onChange={event => setTargetDay(event.target.value)}><option value="">选择同城日期</option>{current.days.map((value, index) => index !== activeDay && value.city === day.city ? <option key={index} value={index}>D{value.day} {value.city}</option> : null)}</select></label>
            <button disabled={!targetDay} onClick={() => { const toDayIndex = Number(targetDay); commit(moveScheduleItem(current, { fromDayIndex: activeDay, fromItemIndex: activeItem, toDayIndex, toItemIndex: current.days[toDayIndex]?.items.length ?? 0 })); setActiveItem(0); setTargetDay(""); setEditor(null); }}>移动安排</button>
            <button className="adjust-panel__remove" disabled={selected.locked} onClick={removeSelected}><Trash2 size={15} />{selected.locked ? "必去地点不可移除" : "移除该安排"}</button>
          </div>
          <form className="timing-editor" key={`${activeDay}-${activeItem}-${selected.time}-${selected.duration_minutes}`} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const time = String(values.get("time") ?? ""); const duration = Number(values.get("duration")); const next = updateItemTiming(current, activeDay, activeItem, time, duration); if (next === current) { setStatus("请输入有效时间和停留时长，安排不能跨越午夜。"); return; } commit(next); setActiveItem(next.days[activeDay].items.findIndex((item) => item.name === selected.name && item.time === time)); setStatus(""); }}>
            <label><span>开始时间</span><input aria-label="开始时间" name="time" type="time" defaultValue={selected.time} required /></label>
            <label><span>停留分钟</span><input aria-label="停留分钟" name="duration" type="number" min="1" max="900" defaultValue={selected.duration_minutes} required /></label>
            <button className="button button--primary" type="submit">更新时间</button>
          </form>
        </section>
      )}

      {editor && <PlaceEditor city={day.city} key={`${editor}-${activeDay}-${activeItem}`} original={editor === "replace" ? selected : undefined} onCancel={() => setEditor(null)} onCommit={item => {
        const next = editor === "replace" ? replaceItem(current, activeDay, activeItem, item) : addItem(current, activeDay, item);
        commit(next);
        setActiveItem(next.days[activeDay].items.findIndex(value => value.name === item.name && value.time === item.time));
        setEditor(null);
      }} />}
      {aiOpen && <AiDayRecommendations
        itinerary={current}
        dayIndex={activeDay}
        onClose={() => setAiOpen(false)}
        onApply={(items) => {
          const next = addRecommendedItems(current, activeDay, items);
          commit(next);
          const firstPoi = items[0]?.poi_id;
          if (firstPoi) {
            const index = next.days[activeDay]?.items.findIndex((item) => item.poi_id === firstPoi) ?? -1;
            if (index >= 0) setActiveItem(index);
          }
        }}
      />}
      {issues.length > 0 && <div className="schedule-warning" role="note"><strong>当天安排建议</strong>{Array.from(new Set(issues.map((issue) => issue.kind))).map((kind) => { const matches = issues.filter((issue) => issue.kind === kind); const names = Array.from(new Set(matches.flatMap((issue) => issue.itemIndexes.map((index) => day.items[index]?.name).filter(Boolean)))); const labels = { overlap: "时间有重叠", late: "结束时间偏晚", dense: "当天安排偏多", unlocated: "仍有地点待定位" } as const; return <p key={kind}>{labels[kind]}{names.length ? `：${names.join("、")}` : ""}</p>; })}<small>提示不阻止保存；开放时间与真实通勤仍请出发前确认。</small></div>}

      <section className="trip-workspace">
        <div className="timeline-panel">
          <div className="day-heading"><div><span>{formatDate(day.date)} · {day.city}</span><h2>{day.title}</h2></div><span className="intensity">{day.intensity}</span></div>
          <div className="timeline-tools"><button className="button button--ai" aria-expanded={aiOpen} onClick={() => { setAiOpen((visible) => !visible); setEditor(null); setShowAdjustments(false); }}><Sparkles size={16} />AI 推荐</button><button className="button button--ghost" onClick={() => { setEditor("add"); setAiOpen(false); }}>添加安排</button><button className="button button--ghost" disabled={!selected} aria-expanded={showAdjustments} onClick={() => { setShowAdjustments(visible => !visible); setEditor(null); setAiOpen(false); }}>编辑选中安排</button></div>
          {day.items.length === 0 && <p className="day-empty">当天还没有安排</p>}
          <div className="timeline">
            {day.items.map((item, index) => (
              <article
                tabIndex={0}
                draggable
                aria-label={`选择安排：${item.name}`}
                className={`timeline-item${activeItem === index ? " is-active" : ""}${dragTarget === index ? " is-drop-target" : ""}`}
                key={`${item.name}-${index}`}
                onClick={() => { setActiveItem(index); setEditor(null); }}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveItem(index); setEditor(null); } }}
                onDragStart={(event) => { setDragSource(index); setDragTarget(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragTarget(index); }}
                onDrop={(event) => { event.preventDefault(); const payloadIndex = Number(event.dataTransfer.getData("text/plain")); const sourceIndex = Number.isInteger(payloadIndex) && payloadIndex >= 0 && payloadIndex < day.items.length ? payloadIndex : dragSource; if (sourceIndex !== null && sourceIndex !== index) { commit(moveScheduleItem(current, { fromDayIndex: activeDay, fromItemIndex: sourceIndex, toDayIndex: activeDay, toItemIndex: index })); setActiveItem(index); } setDragSource(null); setDragTarget(null); }}
                onDragEnd={() => { setDragSource(null); setDragTarget(null); }}
              >
                <div className="timeline-time"><strong>{item.time}</strong><span>{item.end_time}</span></div>
                <div className="timeline-rail"><span>{index + 1}</span></div>
                <div className="timeline-card">
                  <div className="timeline-card__title"><div><h3>{item.name}</h3><span>{item.category}</span></div><span className="timeline-card__controls"><button type="button" className="drag-handle" aria-label={`拖动安排：${item.name}`} tabIndex={-1}><GripVertical size={17} /></button><ChevronRight size={18} /></span></div>
                  <p>{item.description}</p>
                  <div className="item-meta">
                    <span><Clock3 size={14} />{item.duration_minutes} 分钟</span>
                    {item.transport && <span><Bus size={14} />{item.transport}{item.transport_minutes ? ` ${item.transport_minutes} 分钟` : ""}</span>}
                    {item.cost > 0 && <span><Coins size={14} />{money(item.cost)}</span>}
                  </div>
                  {(item.locked || item.notice) && <div className="item-flags">{item.locked && <span><LockKeyhole size={13} />必去</span>}{item.notice && <span className="needs-check"><AlertCircle size={13} />{item.notice}</span>}</div>}
                </div>
              </article>
            ))}
          </div>
          <p className="travel-reminder"><AlertCircle size={15} />部分信息为演示数据，请在出发前核对开放时间、班次与票价。</p>
        </div>

        <div className="map-panel">
          <RouteMap items={day.items} activeIndex={activeItem} onSelect={setActiveItem} />
          <div className="selected-place">
            <span className="selected-place__marker"><MapPin size={18} /></span>
            <div><small>当前地点</small><strong>{day.items[activeItem]?.name}</strong><p>{day.items[activeItem]?.description}</p></div>
          </div>
          <div className="budget-bar">
            <div><span>总预算</span><strong>{money(current.budget.total_available)}</strong></div>
            <div><span>预算预估</span><strong>{money(current.budget.estimated_total)}</strong></div>
            <div><span>{current.budget.remaining < 0 ? "预计超支" : "预计结余"}</span><strong className={current.budget.remaining < 0 ? "budget-negative" : "budget-positive"}>{money(Math.abs(current.budget.remaining))}</strong></div>
            <button className="button button--primary" aria-expanded={showAdjustments} onClick={() => setShowAdjustments((visible) => !visible)}>调整行程</button>
          </div>
        </div>
      </section>
      </div>

      <div hidden={workspace !== "logistics"}>
        <TravelLogistics itinerary={current} draft={reservationDraft} onDraftChange={setReservationDraft} onCommit={commitReservation} onDelete={deleteReservation} />
      </div>

      <div hidden={workspace !== "budget"}>
        <TravelBudget itinerary={current} draft={budgetDraft} onStartEdit={() => setBudgetDraft(getPerPersonAllocations(current))} onDraftChange={setBudgetDraft} onCommit={commitBudget} onCancel={() => setBudgetDraft(null)} />
      </div>
    </main>
  );
}
