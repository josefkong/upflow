"use client";

import { useEffect, useRef } from "react";
import { Check, Cloud, Clock } from "lucide-react";

import { appDateKey, cn } from "@/lib/utils";

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export type CalendarTimelineItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  title: string;
  source: "upflow" | "google";
  sourceLabel: string;
  colorRgb: string;
  complete?: boolean;
  cancelled?: boolean;
  readOnly?: boolean;
};

type CalendarTimeGridProps = {
  days: Date[];
  items: CalendarTimelineItem[];
  language: "en" | "pt-BR";
  today: Date;
  allDayLabel: string;
  emptyLabel: string;
  onSelectDay: (day: Date) => void;
  onOpenItem: (item: CalendarTimelineItem) => void;
};

function minutesFromMidnight(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function itemPosition(item: CalendarTimelineItem) {
  const start = minutesFromMidnight(item.startsAt);
  const startDate = new Date(item.startsAt);
  const endDate = item.endsAt ? new Date(item.endsAt) : new Date(startDate.getTime() + 60 * 60 * 1000);
  const crossesDay = appDateKey(startDate) !== appDateKey(endDate);
  const end = crossesDay ? 24 * 60 : endDate.getHours() * 60 + endDate.getMinutes();
  const duration = Math.max(end - start, 30);

  return {
    top: (start / 60) * HOUR_HEIGHT,
    height: Math.max((duration / 60) * HOUR_HEIGHT, 34),
  };
}

function itemInterval(item: CalendarTimelineItem) {
  const start = new Date(item.startsAt).getTime();
  const end = item.endsAt
    ? new Date(item.endsAt).getTime()
    : start + 60 * 60 * 1000;
  return { start, end: Math.max(end, start + 30 * 60 * 1000) };
}

function layoutOverlappingItems(items: CalendarTimelineItem[]) {
  const sorted = [...items].sort((left, right) => {
    const startDifference = itemInterval(left).start - itemInterval(right).start;
    return startDifference || left.id.localeCompare(right.id);
  });
  const layouts = new Map<string, { column: number; columns: number }>();
  let group: Array<{ item: CalendarTimelineItem; column: number }> = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const commitGroup = () => {
    const columns = Math.max(columnEnds.length, 1);
    group.forEach(({ item, column }) => {
      layouts.set(`${item.source}-${item.id}`, { column, columns });
    });
    group = [];
    columnEnds = [];
    groupEnd = -Infinity;
  };

  sorted.forEach((item) => {
    const interval = itemInterval(item);
    if (group.length > 0 && interval.start >= groupEnd) commitGroup();

    let column = columnEnds.findIndex((end) => end <= interval.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = interval.end;
    groupEnd = Math.max(groupEnd, interval.end);
    group.push({ item, column });
  });
  if (group.length > 0) commitGroup();

  return layouts;
}

export default function CalendarTimeGrid({
  days,
  items,
  language,
  today,
  allDayLabel,
  emptyLabel,
  onSelectDay,
  onOpenItem,
}: CalendarTimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const minDayWidth = days.length === 1 ? 240 : days.length <= 4 ? 190 : 120;
  const gridTemplateColumns = `4.5rem repeat(${days.length}, minmax(${minDayWidth}px, 1fr))`;
  const gridMinWidth = 72 + minDayWidth * days.length;
  const currentMinutes = today.getHours() * 60 + today.getMinutes();

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const firstTimedItem = items
      .filter((item) => !item.allDay)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0];
    const initialHour = firstTimedItem
      ? Math.max(new Date(firstTimedItem.startsAt).getHours() - 1, 0)
      : Math.max(today.getHours() - 2, 0);
    scrollContainer.scrollTop = initialHour * HOUR_HEIGHT;
  }, [days.length, items, today]);

  return (
    <div
      data-testid="calendar-time-grid"
      className="overflow-hidden rounded-xl border border-border bg-background/35 dark:border-white/10 dark:bg-[#060b18]/70"
    >
      <div className="overflow-x-auto">
        <div style={{ minWidth: gridMinWidth }}>
          <div
            className="grid border-b border-border bg-muted/35 dark:border-white/10 dark:bg-white/[0.04]"
            style={{ gridTemplateColumns }}
          >
            <div className="border-r border-border dark:border-white/10" />
            {days.map((day) => {
              const selectedToday = appDateKey(day) === appDateKey(today);
              return (
                <button
                  key={appDateKey(day)}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className="min-w-0 border-r border-border px-3 py-3 text-left last:border-r-0 hover:bg-accent/60 dark:border-white/10 dark:hover:bg-white/[0.05]"
                >
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {new Intl.DateTimeFormat(language, { weekday: "short" }).format(day)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-sm font-semibold",
                      selectedToday ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="grid min-h-14 border-b border-border dark:border-white/10"
            style={{ gridTemplateColumns }}
          >
            <div className="flex items-center border-r border-border px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:border-white/10">
              {allDayLabel}
            </div>
            {days.map((day) => {
              const key = appDateKey(day);
              const allDayItems = items.filter((item) => item.allDay && appDateKey(item.startsAt) === key);
              return (
                <div key={key} className="space-y-1 border-r border-border p-1.5 last:border-r-0 dark:border-white/10">
                  {allDayItems.map((item) => (
                    <button
                      key={`${item.source}-${item.id}`}
                      type="button"
                      onClick={() => onOpenItem(item)}
                      className="flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-2 px-2 py-1 text-left text-[10px] font-medium text-foreground transition hover:brightness-110"
                      style={{
                        borderLeftColor: `rgb(${item.colorRgb})`,
                        backgroundColor: `rgb(${item.colorRgb} / 0.16)`,
                      }}
                    >
                      {item.source === "google" && <Cloud className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          <div ref={scrollRef} className="max-h-[42rem] overflow-y-auto overscroll-contain">
            <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 grid border-t border-border/70 dark:border-white/[0.07]"
                  style={{ top: hour * HOUR_HEIGHT, gridTemplateColumns }}
                >
                  <div className="-translate-y-2.5 border-r border-border pr-2 text-right text-[10px] tabular-nums text-muted-foreground dark:border-white/10">
                    {new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(
                      new Date(2026, 0, 1, hour, 0),
                    )}
                  </div>
                  {days.map((day) => (
                    <div key={appDateKey(day)} className="h-16 border-r border-border last:border-r-0 dark:border-white/10" />
                  ))}
                </div>
              ))}

              <div className="absolute inset-y-0 left-[4.5rem] right-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${minDayWidth}px, 1fr))` }}>
                {days.map((day) => {
                  const key = appDateKey(day);
                  const dayItems = items.filter((item) => !item.allDay && appDateKey(item.startsAt) === key);
                  const itemLayouts = layoutOverlappingItems(dayItems);
                  const isToday = key === appDateKey(today);
                  return (
                    <div key={key} className="relative min-w-0 border-r border-border last:border-r-0 dark:border-white/10">
                      {isToday && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 z-20 border-t border-rose-400"
                          style={{ top: (currentMinutes / 60) * HOUR_HEIGHT }}
                        >
                          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]" />
                        </div>
                      )}
                      {dayItems.map((item) => {
                        const position = itemPosition(item);
                        const layout = itemLayouts.get(`${item.source}-${item.id}`) ?? { column: 0, columns: 1 };
                        const width = 100 / layout.columns;
                        return (
                          <button
                            key={`${item.source}-${item.id}`}
                            type="button"
                            onClick={() => onOpenItem(item)}
                            title={`${item.title} · ${item.sourceLabel}`}
                            className={cn(
                              "absolute z-10 overflow-hidden rounded-lg border border-white/5 border-l-2 px-2 py-1.5 text-left shadow-sm transition hover:z-30 hover:brightness-110 focus:z-30 focus:outline-none focus:ring-2 focus:ring-primary/50",
                              item.cancelled && "opacity-55 line-through",
                            )}
                            style={{
                              top: position.top,
                              height: position.height,
                              left: `calc(${layout.column * width}% + 4px)`,
                              width: `calc(${width}% - 6px)`,
                              borderLeftColor: `rgb(${item.colorRgb})`,
                              backgroundColor: `rgb(${item.colorRgb} / 0.18)`,
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-foreground sm:text-xs">
                              {item.complete ? <Check className="h-3 w-3 shrink-0" /> : item.source === "google" ? <Cloud className="h-3 w-3 shrink-0" /> : null}
                              <span className="truncate">{item.title}</span>
                            </span>
                            {position.height >= 46 && (
                              <span className="mt-1 flex items-center gap-1 truncate text-[9px] text-muted-foreground sm:text-[10px]">
                                <Clock className="h-3 w-3 shrink-0" />
                                {new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(item.startsAt))}
                                <span aria-hidden="true">·</span>
                                {item.sourceLabel}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {dayItems.length === 0 && days.length === 1 && (
                        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground/50">
                          {emptyLabel}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
