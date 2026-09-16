"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import PropTypes from "prop-types";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import { fmt } from "./UsageTable";

const TOP_N = 5;
const PALETTE = ["#6366f1", "#22c55e", "#8b5cf6", "#ef4444", "#f59e0b", "#14b8a6", "#3b82f6", "#ec4899"];
const OTHERS_COLOR = "#9ca3af";

const trimDecimal = (x) => String(parseFloat(x.toFixed(1)));

// Locale-aware token count: 亿/万 for Chinese locales, K/M/B elsewhere
export function fmtTokensLocale(n, locale) {
  n = n || 0;
  if (locale && locale.startsWith("zh")) {
    if (n >= 1e8) return `${trimDecimal(n / 1e8)}亿`;
    if (n >= 1e4) return `${trimDecimal(n / 1e4)}万`;
    return fmt(n);
  }
  if (n >= 1e9) return `${trimDecimal(n / 1e9)}B`;
  if (n >= 1e6) return `${trimDecimal(n / 1e6)}M`;
  if (n >= 1e3) return `${trimDecimal(n / 1e3)}K`;
  return String(n);
}

function fmtCostSmart(n) {
  n = n || 0;
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function fmtPercent(value, total) {
  if (!total) return "0%";
  const p = (value / total) * 100;
  return `${p >= 9.95 ? Math.round(p) : parseFloat(p.toFixed(1))}%`;
}

function BreakdownTooltip({ active, payload, viewMode, locale, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="min-w-[150px] space-y-1 rounded-lg p-2.5 text-xs shadow-lg"
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
      }}
    >
      <p className="max-w-[240px] truncate font-medium" style={{ color: "var(--color-text-main)" }}>{d.name}</p>
      <p style={{ color: "var(--color-text-muted)" }}>
        {viewMode === "tokens" ? fmtTokensLocale(d.value, locale) : fmtCostSmart(d.value)} · {fmtPercent(d.value, total)}
      </p>
      <p style={{ color: "var(--color-text-muted)" }}>{fmt(d.requests)} {translate("Requests")}</p>
    </div>
  );
}

BreakdownTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  viewMode: PropTypes.string.isRequired,
  locale: PropTypes.string.isRequired,
  total: PropTypes.number.isRequired,
};

/**
 * Donut chart + legend breakdown of usage by the active dimension.
 * Replaces the flat stats table with a share-of-total visualization:
 * left donut with total in the center, right legend list with percentage,
 * amount, and expandable per-provider detail rows.
 */
export default function UsageBreakdown({ title, groups, viewMode, emptyMessage }) {
  const [locale, setLocale] = useState(getCurrentLocale());
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  // Group summaries from groupDataByKey carry `cost`; detail items from sortData
  // carry `totalCost`. Accept either so both levels aggregate correctly.
  const metric = (summary) =>
    viewMode === "tokens" ? summary.totalTokens || 0 : summary.totalCost ?? summary.cost ?? 0;

  const { rows, total } = useMemo(() => {
    const sorted = groups
      .map((g) => ({ g, v: metric(g.summary) }))
      .filter(({ v }) => v > 0)
      .sort((a, b) => b.v - a.v);
    const totalValue = sorted.reduce((acc, { v }) => acc + v, 0);
    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N);

    const rows = top.map(({ g, v }, i) => ({
      name: g.groupKey,
      value: v,
      color: PALETTE[i % PALETTE.length],
      pending: (g.summary.pending || 0) > 0,
      requests: g.summary.requests || 0,
      details: g.items.map((item) => ({
        key: item.key || item.groupKey || item.rawModel,
        badge: item.provider || null,
        sub: item.rawModel && item.rawModel !== g.groupKey ? item.rawModel : null,
        requests: item.requests || 0,
        value: metric(item),
      })),
    }));

    if (rest.length) {
      rows.push({
        name: translate("Other"),
        value: rest.reduce((acc, { v }) => acc + v, 0),
        color: OTHERS_COLOR,
        pending: rest.some(({ g }) => (g.summary.pending || 0) > 0),
        requests: rest.reduce((acc, { g }) => acc + (g.summary.requests || 0), 0),
        details: rest.map(({ g, v }) => ({
          key: g.groupKey,
          badge: null,
          sub: g.groupKey,
          requests: g.summary.requests || 0,
          value: v,
        })),
      });
    }
    return { rows, total: totalValue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, viewMode, locale]);

  const fmtValue = (v) => (viewMode === "tokens" ? fmtTokensLocale(v, locale) : fmtCostSmart(v));

  const toggleExpand = (name) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // Sector renderer: enlarges the active sector (tooltip hover or legend hover)
  // and dims the rest while something is hovered.
  const renderSector = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, isActive, index } = props;
    const active = isActive || hovered === index;
    const dimmed = hovered != null && !active;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={active ? outerRadius + 6 : outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill || (rows[index] && rows[index].color)}
        cornerRadius={3}
        opacity={dimmed ? 0.35 : 1}
        style={{ transition: "opacity 150ms ease, d 150ms ease", cursor: "pointer", outline: "none" }}
      />
    );
  };

  return (
    <Card title={title} padding="sm" className="overflow-hidden">
      {rows.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center text-sm text-text-muted">{emptyMessage}</div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Donut with centered total */}
          <div className="relative aspect-square w-full max-w-[260px] shrink-0 sm:w-[240px] sm:max-w-none">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="64%"
                  outerRadius="88%"
                  paddingAngle={2}
                  shape={renderSector}
                  onMouseEnter={(_, index) => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {rows.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                </Pie>
                <Tooltip content={<BreakdownTooltip viewMode={viewMode} locale={locale} total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <span className="text-xl font-semibold tabular-nums text-text-main">
                {fmtValue(total)}
              </span>
              <span className="text-xs text-text-muted">
                {viewMode === "tokens" ? "tokens" : translate("Total Cost")}
              </span>
            </div>
          </div>

          {/* Legend list with expandable details */}
          <div className="flex min-w-0 flex-1 flex-col self-stretch justify-center">
            {rows.map((row, i) => (
              <div key={row.name} className={i > 0 ? "border-t border-border/60" : ""}>
                <button
                  type="button"
                  onClick={() => toggleExpand(row.name)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-subtle/50"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] text-text-muted transition-transform ${expanded.has(row.name) ? "rotate-90" : ""}`}
                  >
                    chevron_right
                  </span>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.pending ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: row.color }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${row.pending ? "text-primary" : "text-text-main"}`}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-text-muted">
                    {fmtPercent(row.value, total)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-text-main">
                    {fmtValue(row.value)}
                  </span>
                </button>
                {expanded.has(row.name) && row.details.map((d) => (
                  <div key={`${row.name}:${d.key}`} className="flex items-center gap-2 py-1.5 pl-10 pr-2 text-xs">
                    {d.badge ? (
                      <Badge variant="neutral" size="sm">{d.badge}</Badge>
                    ) : (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full opacity-50"
                        style={{ backgroundColor: row.color }}
                      />
                    )}
                    {d.sub ? (
                      <span className="min-w-0 flex-1 truncate text-text-muted" title={d.sub}>{d.sub}</span>
                    ) : (
                      <span className="min-w-0 flex-1" />
                    )}
                    <span className="shrink-0 text-text-muted">
                      {fmt(d.requests)} {translate("Requests")}
                    </span>
                    <span className="w-20 shrink-0 text-right font-medium tabular-nums text-text-main">
                      {fmtValue(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

UsageBreakdown.propTypes = {
  title: PropTypes.string.isRequired,
  groups: PropTypes.array.isRequired,
  viewMode: PropTypes.string.isRequired,
  emptyMessage: PropTypes.string.isRequired,
};
