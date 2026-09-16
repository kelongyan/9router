"use client";

import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import { fmt } from "./UsageTable";
import { fmtTokensLocale } from "./UsageBreakdown";

const MODES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "cumulative", label: "Cumulative" },
];

const WEEKS = 53;
const CELL = 10; // px
const GAP = 2; // px

// Empty cell uses the subtle surface tint; active cells blend the brand
// primary into the surface so light/dark themes both stay readable.
const LEVEL_COLORS = [
  "var(--color-surface-2)",
  "color-mix(in srgb, var(--color-primary) 28%, var(--color-surface))",
  "color-mix(in srgb, var(--color-primary) 52%, var(--color-surface))",
  "color-mix(in srgb, var(--color-primary) 76%, var(--color-surface))",
  "var(--color-primary)",
];

const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "YYYY-MM-DD" → local Date (avoid UTC parsing offset)
const dateFromKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const mondayDateKey = (key) => {
  const d = dateFromKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(d);
};

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedValues[base + 1];
  return next !== undefined
    ? sortedValues[base] + rest * (next - sortedValues[base])
    : sortedValues[base];
}

/**
 * GitHub-style year activity heatmap of token usage.
 * Modes: daily (per-day value), weekly (per-week aggregate),
 * cumulative (running total across all history).
 */
export default function TokenActivity({ days }) {
  const [mode, setMode] = useState("daily");
  const [locale, setLocale] = useState(getCurrentLocale());
  const [tip, setTip] = useState(null);

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  const { cells, monthLabels, levelOf, totalCols } = useMemo(() => {
    if (!days) return { cells: [], monthLabels: [], levelOf: () => 0, totalCols: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);

    // Per-mode value lookup
    let valueOf;
    if (mode === "weekly") {
      const weekTotals = {};
      for (const [key, d] of Object.entries(days)) {
        const wk = mondayDateKey(key);
        weekTotals[wk] = (weekTotals[wk] || 0) + d.tokens;
      }
      valueOf = (key) => weekTotals[mondayDateKey(key)] || 0;
    } else if (mode === "cumulative") {
      const keys = Object.keys(days).sort();
      const prefix = [0];
      keys.forEach((k, i) => prefix.push(prefix[i] + days[k].tokens));
      valueOf = (key) => {
        let lo = 0, hi = keys.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (keys[mid] <= key) lo = mid + 1;
          else hi = mid;
        }
        return prefix[lo];
      };
    } else {
      valueOf = (key) => days[key]?.tokens || 0;
    }

    // Build cells column-major (Mon..Sun per week) across the 53-week window
    const cells = [];
    const values = [];
    const cursor = new Date(start);
    let col = 0, row = 0;
    let lastMonth = -1;
    const monthLabels = [];
    while (cursor <= today) {
      const date = new Date(cursor);
      const dateKey = localDateKey(date);
      const value = valueOf(dateKey);
      cells.push({ col, row, date, dateKey, value });
      if (value > 0) values.push(value);
      if (row === 0 && date.getMonth() !== lastMonth) {
        monthLabels.push({ col, label: date.toLocaleDateString(locale, { month: "short" }) });
        lastMonth = date.getMonth();
      }
      cursor.setDate(cursor.getDate() + 1);
      row++;
      if (row === 7) { row = 0; col++; }
    }

    // Quantile thresholds keep the palette meaningful on long-tail data
    values.sort((a, b) => a - b);
    const t1 = quantile(values, 0.25);
    const t2 = quantile(values, 0.5);
    const t3 = quantile(values, 0.75);
    const levelOf = (v) => (v <= 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);

    return { cells, monthLabels, levelOf, totalCols: col + (row > 0 ? 1 : 0) };
  }, [days, mode, locale]);

  const hasData = days && Object.keys(days).length > 0;
  const labelByCol = useMemo(() => {
    const map = {};
    monthLabels.forEach((m) => { map[m.col] = m.label; });
    return map;
  }, [monthLabels]);

  const localeTag = locale && locale !== "en" ? locale : undefined;

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Token Activity</h3>
        <SegmentedControl options={MODES} value={mode} onChange={setMode} size="sm" />
      </div>

      {days === null ? (
        <div className="flex h-32 items-center justify-center text-text-muted">
          <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
        </div>
      ) : !hasData ? (
        <div className="flex h-32 items-center justify-center text-sm text-text-muted">No usage recorded yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto pb-1">
            <div style={{ width: totalCols * (CELL + GAP) }}>
              <div
                className="grid"
                style={{
                  gridTemplateRows: `repeat(7, ${CELL}px)`,
                  gridAutoFlow: "column",
                  gridAutoColumns: `${CELL}px`,
                  gap: `${GAP}px`,
                }}
              >
                {cells.map((cell) => {
                  const level = levelOf(cell.value);
                  return (
                    <div
                      key={cell.dateKey}
                      className="rounded-[2px] transition-colors hover:outline hover:outline-1 hover:outline-primary/60"
                      style={{ backgroundColor: LEVEL_COLORS[level] }}
                      onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, cell })}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                })}
              </div>
              <div
                className="mt-1 grid"
                style={{
                  gridTemplateColumns: `repeat(${totalCols}, ${CELL}px)`,
                  gap: `${GAP}px`,
                }}
              >
                {Array.from({ length: totalCols }, (_, c) => (
                  <span key={c} className="whitespace-nowrap text-[10px] leading-3 text-text-muted">
                    {labelByCol[c] || ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-1.5 text-xs text-text-muted">
            <span>Less</span>
            {LEVEL_COLORS.map((color, i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
            ))}
            <span>More</span>
          </div>
        </>
      )}

      {tip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[130px] rounded-lg p-2.5 text-xs shadow-lg"
          style={{
            left: tip.x + 14,
            top: tip.y - 8,
            backgroundColor: "var(--color-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--color-text-main)" }}>
            {tip.cell.date.toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric" })}
          </p>
          <p style={{ color: "var(--color-text-muted)" }}>{fmtTokensLocale(tip.cell.value, locale)} tokens</p>
          {mode === "daily" && days?.[tip.cell.dateKey] && (
            <p style={{ color: "var(--color-text-muted)" }}>{fmt(days[tip.cell.dateKey].requests)} requests</p>
          )}
        </div>
      )}
    </Card>
  );
}

TokenActivity.propTypes = {
  days: PropTypes.object,
};
