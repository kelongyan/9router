"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Button, Badge } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

// 通配后缀：`alias/*` 表示保留该 provider 的全部模型。
const WILDCARD_SUFFIX = "/*";

function aliasOf(modelId) {
  const i = modelId.indexOf("/");
  return i > 0 ? modelId.slice(0, i) : "";
}

function GroupHeader({ group, open, selectedCount, isWholeGroup, onToggleOpen, onToggleGroup }) {
  return (
    <div className="flex w-full items-center gap-2 px-4 py-3">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="material-symbols-outlined shrink-0 text-[18px] text-text-muted">
          {open ? "expand_more" : "chevron_right"}
        </span>
        <span className="truncate font-medium">{group.alias}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-muted">
          {selectedCount}/{group.ids.length}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleGroup}
        title="Whole provider (uses alias/*)"
        className={cn(
          "shrink-0 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
          isWholeGroup
            ? "border-brand-500/50 bg-brand-500/10 text-brand-500"
            : "border-surface-2 text-text-muted hover:border-brand-500/40 hover:text-brand-500"
        )}
      >
        {isWholeGroup ? "whole" : "all"}
      </button>
    </div>
  );
}

GroupHeader.propTypes = {
  group: PropTypes.shape({
    alias: PropTypes.string.isRequired,
    ids: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  open: PropTypes.bool.isRequired,
  selectedCount: PropTypes.number.isRequired,
  isWholeGroup: PropTypes.bool.isRequired,
  onToggleOpen: PropTypes.func.isRequired,
  onToggleGroup: PropTypes.func.isRequired,
};

export default function ModelWhitelistClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [available, setAvailable] = useState([]);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState({});
  const [notice, setNotice] = useState(null);

  const flash = useCallback((text, tone = "ok") => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/models/whitelist", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setEntries(Array.isArray(data.ids) ? data.ids : []);
        setAvailable(Array.isArray(data.available) ? data.available : []);
      } catch (e) {
        if (alive) flash(`Load failed: ${e.message}`, "err");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [flash]);

  // ── 白名单条目拆成「具体 id」与「通配 alias」两类 ────────────────
  const { exactSet, wildcardSet } = useMemo(() => {
    const exact = new Set();
    const wild = new Set();
    for (const e of entries) {
      if (typeof e !== "string" || !e) continue;
      if (e.endsWith(WILDCARD_SUFFIX)) wild.add(e.slice(0, -WILDCARD_SUFFIX.length));
      else exact.add(e);
    }
    return { exactSet: exact, wildcardSet: wild };
  }, [entries]);

  const isSelected = useCallback(
    (modelId) => {
      if (exactSet.has(modelId)) return true;
      const alias = aliasOf(modelId);
      return Boolean(alias) && wildcardSet.has(alias);
    },
    [exactSet, wildcardSet]
  );

  // ── 按 provider 分组（应用到搜索过滤之后）──────────────────────
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const m of available) {
      const id = typeof m?.id === "string" ? m.id : "";
      if (!id) continue;
      if (q && !id.toLowerCase().includes(q)) continue;
      const alias = m.owned_by || aliasOf(id) || "(unknown)";
      if (!map.has(alias)) map.set(alias, []);
      map.get(alias).push(id);
    }
    return [...map.entries()]
      .map(([alias, ids]) => ({ alias, ids: [...new Set(ids)].sort() }))
      .sort((a, b) => a.alias.localeCompare(b.alias));
  }, [available, query]);

  const selectedModelCount = useMemo(
    () => available.reduce((n, m) => (m?.id && isSelected(m.id) ? n + 1 : n), 0),
    [available, isSelected]
  );

  const searching = query.trim().length > 0;
  const isOpen = useCallback(
    (alias) => (searching ? true : Boolean(openGroups[alias])),
    [searching, openGroups]
  );

  // ── 变更操作 ──────────────────────────────────────────────────
  const toggleModel = useCallback(
    (modelId) => {
      const alias = aliasOf(modelId);
      if (alias && wildcardSet.has(alias)) return; // 整组已启用时不允许逐条调整
      setEntries((prev) => {
        const set = new Set(prev);
        if (set.has(modelId)) set.delete(modelId);
        else set.add(modelId);
        return [...set];
      });
    },
    [wildcardSet]
  );

  const toggleWholeGroup = useCallback((alias, ids) => {
    setEntries((prev) => {
      const wild = `${alias}${WILDCARD_SUFFIX}`;
      if (prev.includes(wild)) return prev.filter((e) => e !== wild);
      // 启用整组：写通配，并清掉该组已逐条加入的冗余 id
      const idSet = new Set(ids);
      return [...prev.filter((e) => !idSet.has(e)), wild];
    });
  }, []);

  const selectAllInGroup = useCallback((alias, ids) => {
    setEntries((prev) => {
      const wild = `${alias}${WILDCARD_SUFFIX}`;
      if (prev.includes(wild)) return prev;
      return [...new Set([...prev, ...ids])];
    });
  }, []);

  const clearGroup = useCallback((alias, ids) => {
    setEntries((prev) => {
      const wild = `${alias}${WILDCARD_SUFFIX}`;
      const idSet = new Set(ids);
      return prev.filter((e) => e !== wild && !idSet.has(e));
    });
  }, []);

  const allExpanded = groups.length > 0 && groups.every((g) => openGroups[g.alias]);
  const toggleExpandAll = useCallback(() => {
    if (allExpanded) setOpenGroups({});
    else setOpenGroups(Object.fromEntries(groups.map((g) => [g.alias, true])));
  }, [allExpanded, groups]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/models/whitelist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: entries }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries(Array.isArray(data.ids) ? data.ids : []);
      flash("Saved. /v1/models now follows this whitelist.");
    } catch (e) {
      flash(`Save failed: ${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }, [entries, flash]);

  const clearAll = useCallback(async () => {
    if (!window.confirm("Clear the whitelist? /v1/models will return ALL models again.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/models/whitelist", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries([]);
      flash("Cleared. Filtering is now off.");
    } catch (e) {
      flash(`Clear failed: ${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }, [flash]);

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-text-muted">
        <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
        <div className="mt-2">Loading models…</div>
      </Card>
    );
  }

  const isEmpty = entries.length === 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Model Whitelist</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Only whitelisted models are returned by <code className="font-mono">/v1/models</code> —
              on the public URL and on <code className="font-mono">127.0.0.1</code> alike.
              Leave it empty to turn filtering off.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={clearAll} disabled={saving || isEmpty}>
              Clear
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={isEmpty ? "default" : "info"}>
            {isEmpty ? "Filtering off" : "Filtering on"}
          </Badge>
          <span className="text-text-muted">
            {selectedModelCount} model{selectedModelCount === 1 ? "" : "s"} selected ·{" "}
            {entries.length} whitelist entr{entries.length === 1 ? "y" : "ies"} · {available.length}{" "}
            available
          </span>
        </div>

        {notice && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              notice.tone === "err"
                ? "border-red-500/40 bg-red-500/10 text-red-500"
                : "border-green-500/40 bg-green-500/10 text-green-500"
            )}
          >
            {notice.text}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search model id…"
            className="w-full rounded-lg border border-surface-2 bg-surface-2/40 py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-500/50"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={toggleExpandAll}>
          <span className="material-symbols-outlined text-[16px]">
            {allExpanded ? "unfold_less" : "unfold_more"}
          </span>
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-text-muted">No models match this search.</Card>
      ) : (
        groups.map((group) => {
          const open = isOpen(group.alias);
          const whole = wildcardSet.has(group.alias);
          const selectedCount = group.ids.reduce((n, id) => (isSelected(id) ? n + 1 : n), 0);
          return (
            <Card key={group.alias} className="overflow-hidden">
              <GroupHeader
                group={group}
                open={open}
                selectedCount={selectedCount}
                isWholeGroup={whole}
                onToggleOpen={() =>
                  setOpenGroups((p) => ({ ...p, [group.alias]: !p[group.alias] }))
                }
                onToggleGroup={() => toggleWholeGroup(group.alias, group.ids)}
              />
              {open && (
                <div className="border-t border-surface-2">
                  <div className="flex items-center gap-3 border-b border-surface-2 px-4 py-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => selectAllInGroup(group.alias, group.ids)}
                      disabled={whole}
                      className="text-text-muted transition-colors hover:text-brand-500 disabled:opacity-40"
                    >
                      select all
                    </button>
                    <button
                      type="button"
                      onClick={() => clearGroup(group.alias, group.ids)}
                      className="text-text-muted transition-colors hover:text-brand-500"
                    >
                      clear
                    </button>
                    {whole && <span className="text-brand-500">whole provider enabled (alias/*)</span>}
                  </div>
                  <div className="divide-y divide-surface-2">
                    {group.ids.map((id) => {
                      const checked = isSelected(id);
                      const locked = whole;
                      return (
                        <label
                          key={id}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2",
                            locked ? "cursor-default opacity-70" : "cursor-pointer hover:bg-surface-2/40"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggleModel(id)}
                            className="size-4 shrink-0 accent-[var(--color-primary)]"
                          />
                          <span className="truncate font-mono text-xs" title={id}>
                            {id}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
