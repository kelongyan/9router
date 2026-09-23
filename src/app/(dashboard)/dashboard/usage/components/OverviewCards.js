"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import { useState, useEffect } from "react";
import { fmtTokensLocale } from "./UsageBreakdown";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;
// >=10% shows an integer, smaller ratios keep one decimal
const fmtRate = (p) => `${p >= 9.95 ? Math.round(p) : parseFloat(p.toFixed(1))}%`;

export default function OverviewCards({ stats, allTimeStats }) {
  const [locale, setLocale] = useState(getCurrentLocale());
  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Total Requests</span>
        <span className="w-full truncate text-lg font-bold xl:text-xl" title={fmt(stats.totalRequests)}>{fmt(stats.totalRequests)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Total Input Tokens</span>
        <span className="w-full truncate text-lg font-bold text-primary xl:text-xl" title={fmt(stats.totalPromptTokens)}>{fmt(stats.totalPromptTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Cached Tokens</span>
        <span className="w-full truncate text-lg font-bold text-info xl:text-xl" title={fmt(stats.totalCachedTokens)}>{fmt(stats.totalCachedTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Output Tokens</span>
        <span className="w-full truncate text-lg font-bold text-success xl:text-xl" title={fmt(stats.totalCompletionTokens)}>{fmt(stats.totalCompletionTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Est. Cost</span>
        <span className="w-full truncate text-lg font-bold text-warning xl:text-xl" title={`~${fmtCost(stats.totalCost)}`}>~{fmtCost(stats.totalCost)}</span>
        <span className="text-[10px] text-text-muted">Estimated, not actual billing</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Cache Hit Rate</span>
        <span className="w-full truncate text-lg font-bold text-info xl:text-xl">
          {stats.totalPromptTokens > 0
            ? fmtRate(((stats.totalCachedTokens || 0) / stats.totalPromptTokens) * 100)
            : "—"}
        </span>
        <span className="text-[10px] text-text-muted">of input tokens</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">All-Time Tokens</span>
        {/* Render null (not a placeholder string) until data arrives: the async
            update from null creates the text node, which is more reliable here
            than mutating an existing placeholder text node. */}
        <span className="w-full truncate text-lg font-bold text-primary xl:text-xl">
          {allTimeStats ? fmtTokensLocale(allTimeStats.totalTokens, locale) : null}
        </span>
        <span className="text-[10px] text-text-muted">All time</span>
      </Card>
      <Card className="flex min-w-0 flex-col items-center text-center gap-1 px-3 py-3 sm:px-4">
        <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">Peak Day Tokens</span>
        {/* Render null (not a placeholder string) until data arrives: the async
            update from null creates the text node, which is more reliable here
            than mutating an existing placeholder text node. */}
        <span className="w-full truncate text-lg font-bold xl:text-xl">
          {allTimeStats ? fmtTokensLocale(allTimeStats.peakTokens, locale) : null}
        </span>
        <span className="text-[10px] text-text-muted">All time</span>
      </Card>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
  allTimeStats: PropTypes.object,
};
