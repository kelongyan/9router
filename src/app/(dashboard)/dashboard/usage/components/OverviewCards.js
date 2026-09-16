"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import { useState, useEffect } from "react";
import { fmtTokensLocale } from "./UsageBreakdown";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
// >=10% shows an integer, smaller ratios keep one decimal
const fmtRate = (p) => `${p >= 9.95 ? Math.round(p) : parseFloat(p.toFixed(1))}%`;

export default function OverviewCards({ stats, allTimeStats }) {
  const [locale, setLocale] = useState(getCurrentLocale());
  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 sm:gap-4">
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Total Requests</span>
        <span className="truncate text-2xl font-bold">{fmt(stats.totalRequests)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Total Input Tokens</span>
        <span className="truncate text-2xl font-bold text-primary">{fmt(stats.totalPromptTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Cached Tokens</span>
        <span className="truncate text-2xl font-bold text-info">{fmt(stats.totalCachedTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Output Tokens</span>
        <span className="truncate text-2xl font-bold text-success">{fmt(stats.totalCompletionTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Cache Hit Rate</span>
        <span className="truncate text-2xl font-bold text-info">
          {stats.totalPromptTokens > 0
            ? fmtRate(((stats.totalCachedTokens || 0) / stats.totalPromptTokens) * 100)
            : "—"}
        </span>
        <span className="text-[10px] text-text-muted">of input tokens</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">All-Time Tokens</span>
        {/* Render null (not a placeholder string) until data arrives: the async
            update from null creates the text node, which is more reliable here
            than mutating an existing placeholder text node. */}
        <span className="truncate text-2xl font-bold text-primary">
          {allTimeStats ? fmtTokensLocale(allTimeStats.totalTokens, locale) : null}
        </span>
        <span className="text-[10px] text-text-muted">All time</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-sm uppercase font-semibold">Peak Day Tokens</span>
        <span className="truncate text-2xl font-bold">
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
