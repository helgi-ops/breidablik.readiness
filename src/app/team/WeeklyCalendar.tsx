"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ScheduleEvent {
  id: string;
  event_date: string;
  event_time: string | null;
  event_type: string;
  title: string;
  location: string | null;
  description: string | null;
}

interface WeeklyCalendarProps {
  events: ScheduleEvent[];
  isCoachOrAdmin: boolean;
  onDeleteEvent: (eventId: string) => void;
}

const WEEKDAY_LABELS = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const WEEKDAY_LABELS_FULL = [
  "Mánudagur",
  "Þriðjudagur",
  "Miðvikudagur",
  "Fimmtudagur",
  "Föstudagur",
  "Laugardagur",
  "Sunnudagur",
];

const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  training:  { icon: "🏋️", label: "Æfing",     color: "text-green-800",  bg: "bg-green-50",  border: "border-green-200" },
  match:     { icon: "⚽",  label: "Leikur",    color: "text-red-800",    bg: "bg-red-50",    border: "border-red-200" },
  meeting:   { icon: "📋",  label: "Fundur",    color: "text-blue-800",   bg: "bg-blue-50",   border: "border-blue-200" },
  recovery:  { icon: "🧘",  label: "Endurreisn", color: "text-yellow-800", bg: "bg-yellow-50", border: "border-yellow-200" },
  day_off:   { icon: "📅",  label: "Frí dagur", color: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200" },
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(mon.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const mStr = monday.toLocaleDateString("is-IS", { day: "numeric", month: "short" });
  const sStr = sunday.toLocaleDateString("is-IS", { day: "numeric", month: "short" });
  return `${mStr} – ${sStr}`;
}

export default function WeeklyCalendar({ events, isCoachOrAdmin, onDeleteEvent }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monday = useMemo(() => {
    const base = getMonday(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [monday]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const key = e.event_date;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.event_time ?? "").localeCompare(b.event_time ?? ""));
    }
    return map;
  }, [events]);

  const todayStr = dateKey(new Date());
  const isCurrentWeek = weekOffset === 0;

  // Close popup when week changes
  useEffect(() => {
    setSelectedDay(null);
  }, [weekOffset]);

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600"
          aria-label="Fyrri vika"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <span className="font-semibold text-gray-900 text-sm">
            {formatWeekRange(monday)}
          </span>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekOffset(0)}
              className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Í dag
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600"
          aria-label="Næsta vika"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Weekday headers */}
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-xs font-semibold text-gray-500 py-1"
          >
            {label}
          </div>
        ))}

        {/* Day cells */}
        {weekDates.map((date) => {
          const key = dateKey(date);
          const isToday = key === todayStr;
          const isSelected = key === selectedDay;
          const dayEvents = eventsByDate.get(key) ?? [];
          const hasEvents = dayEvents.length > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : key)}
              className={`min-h-[100px] rounded-lg border p-1.5 transition text-left ${
                isSelected
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300"
                  : isToday
                    ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-200"
                    : hasEvents
                      ? "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      : "border-gray-200 bg-white"
              } ${hasEvents ? "cursor-pointer" : "cursor-default"}`}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold leading-none ${
                    isToday ? "text-blue-700" : "text-gray-600"
                  }`}
                >
                  {date.getDate()}
                </span>
                {isToday && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </div>

              {/* Event dots / compact preview */}
              <div className="space-y-1">
                {dayEvents.map((event) => {
                  const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.day_off;
                  return (
                    <div
                      key={event.id}
                      className={`rounded px-1 py-0.5 border text-[10px] leading-tight ${cfg.bg} ${cfg.border} ${cfg.color}`}
                    >
                      <div className="flex items-start gap-0.5">
                        <span className="flex-shrink-0">{cfg.icon}</span>
                        <span className="font-medium truncate">{event.title}</span>
                      </div>
                      {event.event_time && (
                        <div className="text-[9px] opacity-70 ml-3.5">
                          {event.event_time.slice(0, 5)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail popup */}
      {selectedDay && (
        <DayDetailPopup
          dateStr={selectedDay}
          events={eventsByDate.get(selectedDay) ?? []}
          isToday={selectedDay === todayStr}
          isCoachOrAdmin={isCoachOrAdmin}
          onDeleteEvent={onDeleteEvent}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

/* ── Day detail popup ─────────────────────────────────────────────────── */

function DayDetailPopup({
  dateStr,
  events,
  isToday,
  isCoachOrAdmin,
  onDeleteEvent,
  onClose,
}: {
  dateStr: string;
  events: ScheduleEvent[];
  isToday: boolean;
  isCoachOrAdmin: boolean;
  onDeleteEvent: (id: string) => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay listener to avoid closing immediately from the cell click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const date = new Date(dateStr + "T12:00:00");
  const dayIdx = (date.getDay() + 6) % 7; // Mon=0
  const dateFormatted = date.toLocaleDateString("is-IS", {
    day: "numeric",
    month: "long",
  });

  return (
    <div
      ref={popupRef}
      className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${isToday ? "bg-blue-50" : "bg-gray-50"}`}>
        <div>
          <div className={`text-sm font-bold ${isToday ? "text-blue-800" : "text-gray-900"}`}>
            {WEEKDAY_LABELS_FULL[dayIdx]}
          </div>
          <div className="text-xs text-gray-500">
            {dateFormatted}
            {isToday && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold">
                Í dag
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Events */}
      <div className="px-4 py-3 space-y-2.5">
        {events.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-2">Engir atburðir</div>
        ) : (
          events.map((event) => {
            const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.day_off;
            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${cfg.color}`}>{event.title}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {event.event_time && (
                      <span className="text-xs text-gray-600 font-medium">
                        {event.event_time.slice(0, 5)}
                      </span>
                    )}
                    {event.location && (
                      <span className="text-xs text-gray-500">
                        📍 {event.location}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                      {event.description}
                    </div>
                  )}
                </div>
                {isCoachOrAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(event.id);
                    }}
                    className="text-gray-400 hover:text-red-600 transition flex-shrink-0 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
