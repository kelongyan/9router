"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Card, Button, Badge, Toggle } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";

// 通配后缀：`alias/*` 表示保留该 provider 的全部模型。
const WILDCARD_SUFFIX = "/*";

function aliasOf(modelId) {
  const i = modelId.indexOf("/");
  return i > 0 ? modelId.slice(0, i) : "";
}

function GroupHeader({ group, open, selectedCount, isWholeGroup, onToggleOpen, onToggleGroup }) {
  const total = group.ids.length;
  const pct = total > 0 ? Math.round((selectedCount / total) * 100) : 0;
  const full = selectedCount > 0 && selectedCount === total;
  return (
    <div className="relative">
      <div className="flex w-full items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 text-left"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] text-text-muted">
            {open ? "expand_more" : "chevron_right"}
          </span>
          <ProviderIcon
            providerId={group.alias}
            size={24}
            className="shrink-0 rounded-md object-contain"
            fallbackText={group.alias.slice(0, 2).toUpperCase()}
          />
          <span className="truncate font-semibold">{group.alias}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums",
              full ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-surface-2 text-text-muted"
            )}
          >
            {selectedCount}/{total}
          </span>
        </button>
        <div className="shrink-0" title="Whole provider (uses alias/*)">
          <Toggle size="sm" checked={isWholeGroup} onChange={onToggleGroup} />
        </div>
      </div>
      {pct > 0 && (
        <div
          className={cn(
            "absolute bottom-0 left-0 h-[2px] transition-all duration-300",
            full ? "bg-green-500" : "bg-brand-500"
          )}
          style={{ width: `${pct}%` }}
        />
      )}
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

function ModelRow({ id, checked, locked, alias, onToggle, onStartEdit }) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
        checked ? "bg-brand-500/[0.08]" : "hover:bg-surface-2/60",
        locked && "opacity-70"
      )}
    >
      <label
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5",
          locked ? "cursor-default" : "cursor-pointer"
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={locked}
          onChange={() => onToggle(id)}
        />
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
            checked
              ? "border-brand-500 bg-brand-500"
              : "border-surface-3 group-hover:border-brand-500/60",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30"
          )}
        >
          <span
            className={cn(
              "material-symbols-outlined text-[13px] leading-none text-white transition-opacity",
              checked ? "opacity-100" : "opacity-0"
            )}
          >
            check
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs" title={id}>
            {id}
          </span>
          {alias && (
            <span className="block truncate font-mono text-[10px] text-brand-500" title={alias}>
              → {alias}
            </span>
          )}
        </span>
      </label>
      <button
        type="button"
        onClick={onStartEdit}
        title={alias ? `Edit alias "${alias}"` : "Add alias"}
        className="shrink-0 rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-brand-500 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[15px]">sell</span>
      </button>
    </div>
  );
}

ModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  locked: PropTypes.bool.isRequired,
  alias: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
  onStartEdit: PropTypes.func.isRequired,
};

function AliasEditor({ id, initial, saving, onCommit, onRemove, onCancel }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2/40 px-2.5 py-2 sm:col-span-2">
      <span className="material-symbols-outlined shrink-0 text-[15px] text-text-muted">sell</span>
      <span className="truncate font-mono text-[11px] text-text-muted" title={id}>
        {id}
      </span>
      <span className="shrink-0 text-text-muted">→</span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="short alias, e.g. fast-gpt"
        className="h-7 min-w-0 flex-1 rounded-lg border border-transparent bg-surface px-2.5 font-mono text-xs text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
      />
      <Button size="sm" onClick={() => onCommit(draft)} disabled={saving} icon="check">
        Save
      </Button>
      {initial && (
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={saving} icon="delete">
          Remove
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <span className="w-full text-[10px] text-text-muted sm:w-auto">
        letters/digits/.-_ only, no slash — clients call this instead of the real id
      </span>
    </div>
  );
}

AliasEditor.propTypes = {
  id: PropTypes.string.isRequired,
  initial: PropTypes.string,
  saving: PropTypes.bool.isRequired,
  onCommit: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default function ModelWhitelistClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [savedEntries, setSavedEntries] = useState([]);
  const [available, setAvailable] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [notice, setNotice] = useState(null);
  const [aliases, setAliases] = useState({});
  const [editingAliasId, setEditingAliasId] = useState(null);
  const [aliasSaving, setAliasSaving] = useState(false);
  // 整组开关启用时被清掉的精确 id（alias → ids[]），关闭时恢复，避免 on→off 一圈悄悄丢选择
  const removedByWholeRef = useRef(new Map());

  const flash = useCallback((text, tone = "ok") => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [wlRes, alRes] = await Promise.all([
          fetch("/api/models/whitelist", { cache: "no-store" }),
          fetch("/api/models/aliases", { cache: "no-store" }).catch(() => null),
        ]);
        if (!wlRes.ok) throw new Error(`HTTP ${wlRes.status}`);
        const data = await wlRes.json();
        if (!alive) return;
        const ids = Array.isArray(data.ids) ? data.ids : [];
        setEntries(ids);
        setSavedEntries(ids);
        setAvailable(Array.isArray(data.available) ? data.available : []);
        if (alRes?.ok) {
          const alData = await alRes.json();
          if (!alive) return;
          setAliases(alData?.aliases && typeof alData.aliases === "object" ? alData.aliases : {});
        }
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

  // ── 模型别名（target → alias），对外展示与搜索都用它 ────────────
  const displayAliasById = useMemo(() => {
    const map = new Map();
    for (const [alias, target] of Object.entries(aliases)) {
      if (typeof alias === "string" && typeof target === "string" && target && !map.has(target)) {
        map.set(target, alias);
      }
    }
    return map;
  }, [aliases]);

  const saveAlias = useCallback(
    async (alias, target) => {
      setAliasSaving(true);
      try {
        const res = await fetch("/api/models/aliases", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias, target }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
        setAliases(data.aliases && typeof data.aliases === "object" ? data.aliases : {});
        flash(`Alias "${alias}" saved — /v1/models now shows it.`);
        return true;
      } catch (e) {
        flash(`Alias save failed: ${e.message}`, "err");
        return false;
      } finally {
        setAliasSaving(false);
      }
    },
    [flash]
  );

  const removeAlias = useCallback(
    async (alias) => {
      setAliasSaving(true);
      try {
        const res = await fetch(`/api/models/aliases?alias=${encodeURIComponent(alias)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
        setAliases(data.aliases && typeof data.aliases === "object" ? data.aliases : {});
        flash(`Alias "${alias}" removed.`);
        return true;
      } catch (e) {
        flash(`Alias remove failed: ${e.message}`, "err");
        return false;
      } finally {
        setAliasSaving(false);
      }
    },
    [flash]
  );

  const commitAlias = useCallback(
    async (realId, draft) => {
      const name = (draft || "").trim();
      const current = displayAliasById.get(realId) || "";
      if (!name) {
        if (current) {
          const ok = await removeAlias(current);
          if (!ok) return;
        }
        setEditingAliasId(null);
        return;
      }
      if (name === current) {
        setEditingAliasId(null);
        return;
      }
      const ok = await saveAlias(name, realId);
      if (ok) setEditingAliasId(null);
    },
    [displayAliasById, removeAlias, saveAlias]
  );

  // ── 按 provider 分组（应用到搜索/「只看已选」过滤之后）─────────
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    let matched = 0;
    for (const m of available) {
      const id = typeof m?.id === "string" ? m.id : "";
      if (!id) continue;
      const display = displayAliasById.get(id) || "";
      if (q && !id.toLowerCase().includes(q) && !display.toLowerCase().includes(q)) continue;
      if (selectedOnly && !isSelected(id)) continue;
      matched += 1;
      const alias = m.owned_by || aliasOf(id) || "(unknown)";
      if (!map.has(alias)) map.set(alias, []);
      map.get(alias).push(id);
    }
    return {
      matched,
      list: [...map.entries()]
        .map(([alias, ids]) => ({ alias, ids: [...new Set(ids)].sort() }))
        .sort((a, b) => a.alias.localeCompare(b.alias)),
    };
  }, [available, query, selectedOnly, isSelected, displayAliasById]);

  const selectedModelCount = useMemo(
    () => available.reduce((n, m) => (m?.id && isSelected(m.id) ? n + 1 : n), 0),
    [available, isSelected]
  );

  // ── 未保存标记：entries 与上次保存的集合不一致即提示 ────────────
  const dirty = useMemo(() => {
    if (savedEntries.length !== entries.length) return true;
    const saved = new Set(savedEntries);
    return entries.some((e) => !saved.has(e));
  }, [entries, savedEntries]);

  const searching = query.trim().length > 0;
  const filtering = searching || selectedOnly;
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
      if (prev.includes(wild)) {
        // 关闭整组：删通配，恢复启用时被清掉的精确 id
        const restored = removedByWholeRef.current.get(alias);
        removedByWholeRef.current.delete(alias);
        if (!restored?.length) return prev.filter((e) => e !== wild);
        const withoutWild = prev.filter((e) => e !== wild);
        return [...new Set([...withoutWild, ...restored])];
      }
      // 启用整组：写通配，记录被清掉的冗余 id 以便关闭时恢复
      const idSet = new Set(ids);
      const removed = prev.filter((e) => idSet.has(e));
      if (removed.length > 0) removedByWholeRef.current.set(alias, removed);
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

  const allExpanded = groups.list.length > 0 && groups.list.every((g) => openGroups[g.alias]);
  const toggleExpandAll = useCallback(() => {
    if (allExpanded) setOpenGroups({});
    else setOpenGroups(Object.fromEntries(groups.list.map((g) => [g.alias, true])));
  }, [allExpanded, groups.list]);

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
      const ids = Array.isArray(data.ids) ? data.ids : [];
      setEntries(ids);
      setSavedEntries(ids);
      removedByWholeRef.current.clear();
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
      setSavedEntries([]);
      removedByWholeRef.current.clear();
      flash("Cleared. Filtering is now off.");
    } catch (e) {
      flash(`Clear failed: ${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }, [flash]);

  if (loading) {
    return (
      <Card className="p-10 text-center text-sm text-text-muted">
        <span className="material-symbols-outlined inline-block animate-spin text-[22px]">
          progress_activity
        </span>
        <div className="mt-2">Loading models…</div>
      </Card>
    );
  }

  const isEmpty = entries.length === 0;

  return (
    <div className="space-y-5">
      {/* ── 页头 ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Model Whitelist</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Only whitelisted models are returned by <code className="font-mono">/v1/models</code> —
            on the public URL and on <code className="font-mono">127.0.0.1</code> alike. Leave it
            empty to turn filtering off.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={clearAll} disabled={saving || isEmpty}>
            Clear
          </Button>
          <Button onClick={save} disabled={saving || !dirty} icon="save">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isEmpty ? "default" : "success"} dot>
          {isEmpty ? "Filtering off" : "Filtering on"}
        </Badge>
        {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        <span className="text-xs text-text-muted">
          <span className="font-semibold tabular-nums text-text-main">{selectedModelCount}</span>{" "}
          of <span className="tabular-nums">{available.length}</span> models selected ·{" "}
          <span className="tabular-nums">{entries.length}</span> whitelist entr
          {entries.length === 1 ? "y" : "ies"}
          {Object.keys(aliases).length > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">{Object.keys(aliases).length}</span> alias
              {Object.keys(aliases).length === 1 ? "" : "es"}
            </>
          )}
        </span>
      </div>

      {notice && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            notice.tone === "err"
              ? "border-red-500/40 bg-red-500/10 text-red-500"
              : "border-green-500/40 bg-green-500/10 text-green-500"
          )}
        >
          {notice.text}
        </div>
      )}

      {/* ── 工具栏：搜索 / 只看已选 / 展开全部 ────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search model id…"
            className="h-9 w-full rounded-[10px] border border-transparent bg-surface-2 pl-10 pr-3 text-sm text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setSelectedOnly((v) => !v)}
          aria-pressed={selectedOnly}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-xs font-medium transition-colors",
            selectedOnly
              ? "border-brand-500/50 bg-brand-500/10 text-brand-500"
              : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text-main"
          )}
        >
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
          Selected only
        </button>
        <Button variant="ghost" size="sm" onClick={toggleExpandAll}>
          <span className="material-symbols-outlined text-[16px]">
            {allExpanded ? "unfold_less" : "unfold_more"}
          </span>
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
        {filtering && (
          <span className="ml-auto text-xs tabular-nums text-text-muted">
            {groups.matched} model{groups.matched === 1 ? "" : "s"} in {groups.list.length}{" "}
            provider{groups.list.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* ── provider 分组 ─────────────────────────────────────── */}
      {groups.list.length === 0 ? (
        <Card className="p-10 text-center text-sm text-text-muted">
          {selectedOnly && !searching
            ? "No models selected yet — pick some below or turn off this filter."
            : "No models match this search."}
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.list.map((group) => {
            const open = isOpen(group.alias);
            const whole = wildcardSet.has(group.alias);
            const selectedCount = group.ids.reduce((n, id) => (isSelected(id) ? n + 1 : n), 0);
            return (
              <Card key={group.alias} padding="none" className="overflow-hidden">
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
                  <div className="border-t border-border-subtle px-3 pb-3 pt-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-3 px-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => selectAllInGroup(group.alias, group.ids)}
                        disabled={whole}
                        className="font-medium text-text-muted transition-colors hover:text-brand-500 disabled:opacity-40"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => clearGroup(group.alias, group.ids)}
                        className="font-medium text-text-muted transition-colors hover:text-brand-500"
                      >
                        Clear
                      </button>
                      {whole && (
                        <span className="inline-flex items-center gap-1 font-medium text-brand-500">
                          <span className="material-symbols-outlined text-[13px]">done_all</span>
                          whole provider —{" "}
                          <code className="font-mono">{`${group.alias}${WILDCARD_SUFFIX}`}</code>
                        </span>
                      )}
                    </div>
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      {group.ids.map((id) =>
                        editingAliasId === id ? (
                          <AliasEditor
                            key={id}
                            id={id}
                            initial={displayAliasById.get(id) || ""}
                            saving={aliasSaving}
                            onCommit={(draft) => commitAlias(id, draft)}
                            onRemove={() => {
                              const current = displayAliasById.get(id);
                              if (current) removeAlias(current);
                              setEditingAliasId(null);
                            }}
                            onCancel={() => setEditingAliasId(null)}
                          />
                        ) : (
                          <ModelRow
                            key={id}
                            id={id}
                            checked={isSelected(id)}
                            locked={whole}
                            alias={displayAliasById.get(id) || ""}
                            onToggle={toggleModel}
                            onStartEdit={() => setEditingAliasId(id)}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
