"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Card, Button, Badge, Toggle } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { cn } from "@/shared/utils/cn";

// 通配后缀：`alias/*` 表示保留该 provider 的全部模型。
const WILDCARD_SUFFIX = "/*";

function aliasOf(modelId) {
  const i = modelId.indexOf("/");
  return i > 0 ? modelId.slice(0, i) : "";
}

// ── Provider 下拉框 ────────────────────────────────────────────
function ProviderDropdown({ activeGroup, groups, selectedOnly, onOpenChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (selectedOnly && g.selectedCount === 0) return false;
      if (q && !g.alias.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, selectedOnly, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 min-w-56 max-w-xs items-center gap-2.5 rounded-[10px] border border-transparent bg-surface-2 px-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
      >
        {activeGroup ? (
          <>
            <ProviderIcon
              providerId={activeGroup.alias}
              size={20}
              className="shrink-0 rounded-md object-contain"
              fallbackText={activeGroup.alias.slice(0, 2).toUpperCase()}
            />
            <span className="min-w-0 flex-1 truncate text-left font-semibold">{activeGroup.alias}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                activeGroup.selectedCount === activeGroup.ids.length && activeGroup.ids.length > 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-surface-3 text-text-muted"
              )}
            >
              {activeGroup.selectedCount}/{activeGroup.ids.length}
            </span>
          </>
        ) : (
          <span className="flex-1 text-left text-text-muted">Select a provider…</span>
        )}
        <span className="material-symbols-outlined shrink-0 text-[18px] text-text-muted">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-[var(--shadow-elev)]">
            <div className="border-b border-border-subtle p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search provider…"
                className="h-8 w-full rounded-lg border border-transparent bg-surface-2 px-2.5 text-xs text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {list.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-text-muted">
                  {selectedOnly ? "No providers with selected models." : "No providers match."}
                </div>
              ) : (
                list.map((g) => (
                  <button
                    key={g.alias}
                    type="button"
                    onClick={() => {
                      onSelect(g.alias);
                      close();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-surface-2/60",
                      activeGroup?.alias === g.alias && "bg-brand-500/[0.08]"
                    )}
                  >
                    <ProviderIcon
                      providerId={g.alias}
                      size={22}
                      className="shrink-0 rounded-md object-contain"
                      fallbackText={g.alias.slice(0, 2).toUpperCase()}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{g.alias}</span>
                    {g.selectedCount > 0 && <span className="size-1.5 shrink-0 rounded-full bg-green-500" />}
                    <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                      {g.selectedCount}/{g.ids.length}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

ProviderDropdown.propTypes = {
  activeGroup: PropTypes.shape({
    alias: PropTypes.string.isRequired,
    ids: PropTypes.arrayOf(PropTypes.string).isRequired,
    selectedCount: PropTypes.number.isRequired,
  }),
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      alias: PropTypes.string.isRequired,
      ids: PropTypes.arrayOf(PropTypes.string).isRequired,
      selectedCount: PropTypes.number.isRequired,
    })
  ).isRequired,
  selectedOnly: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func,
  onSelect: PropTypes.func.isRequired,
};

// ── 模型行：checkbox 勾选白名单归属；点击行主体弹二级子菜单 ─────
function ModelRow({ id, checked, locked, alias, onToggle, onOpenMenu }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onOpenMenu(e)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenMenu(e);
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
        checked ? "bg-brand-500/[0.08]" : "hover:bg-surface-2/60",
        locked && "opacity-70"
      )}
    >
      <label className="flex shrink-0 cursor-pointer items-center" onClick={(e) => e.stopPropagation()}>
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
      </label>
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
      <span className="material-symbols-outlined shrink-0 text-[15px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        more_vert
      </span>
    </div>
  );
}

ModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  locked: PropTypes.bool.isRequired,
  alias: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
  onOpenMenu: PropTypes.func.isRequired,
};

// ── 二级子菜单：别名编辑（紧凑态）──────────────────────────────
function MenuAliasEditor({ id, initial, saving, onCommit, onRemove, onCancel }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="px-2.5 py-1.5">
      <div className="truncate font-mono text-[10px] text-text-muted" title={id}>
        {id}
      </div>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="alias, e.g. GLM-5.2"
        className="mt-1.5 h-8 w-full rounded-lg border border-transparent bg-surface-2 px-2.5 font-mono text-xs text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
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
      </div>
      <p className="mt-1 text-[10px] leading-tight text-text-muted">
        letters/digits/.-_ only, no slash
      </p>
    </div>
  );
}

MenuAliasEditor.propTypes = {
  id: PropTypes.string.isRequired,
  initial: PropTypes.string,
  saving: PropTypes.bool.isRequired,
  onCommit: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-main transition-colors hover:bg-surface-2/60"
    >
      <span className="material-symbols-outlined text-[15px] text-text-muted">{icon}</span>
      {label}
    </button>
  );
}

MenuItem.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

// ── 二级子菜单浮层 ─────────────────────────────────────────────
function RowMenu({ menu, alias, editing, saving, copied, onSetAlias, onRemoveAlias, onCopy, onCommit, onCancel, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-60 rounded-xl border border-border-subtle bg-surface py-1.5 shadow-[var(--shadow-elev)]"
        style={{ left: menu.x, top: menu.y }}
      >
        {editing ? (
          <MenuAliasEditor
            id={menu.id}
            initial={alias || ""}
            saving={saving}
            onCommit={onCommit}
            onRemove={onRemoveAlias}
            onCancel={onCancel}
          />
        ) : (
          <>
            <div className="border-b border-border-subtle px-2.5 pb-1.5 pt-0.5">
              <div className="truncate font-mono text-[11px]" title={menu.id}>
                {menu.id}
              </div>
              {alias && (
                <div className="mt-0.5 truncate font-mono text-[11px] text-brand-500" title={alias}>
                  → {alias}
                </div>
              )}
            </div>
            <div className="pt-1">
              <MenuItem icon="sell" label={alias ? "Edit alias" : "Set alias…"} onClick={onSetAlias} />
              {alias && <MenuItem icon="delete" label="Remove alias" onClick={onRemoveAlias} />}
              <MenuItem icon="content_copy" label={copied ? "Copied!" : "Copy model ID"} onClick={onCopy} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

RowMenu.propTypes = {
  menu: PropTypes.shape({ id: PropTypes.string.isRequired, x: PropTypes.number.isRequired, y: PropTypes.number.isRequired })
    .isRequired,
  alias: PropTypes.string,
  editing: PropTypes.bool.isRequired,
  saving: PropTypes.bool.isRequired,
  copied: PropTypes.bool,
  onSetAlias: PropTypes.func.isRequired,
  onRemoveAlias: PropTypes.func.isRequired,
  onCopy: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function ModelWhitelistClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [savedEntries, setSavedEntries] = useState([]);
  const [available, setAvailable] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [notice, setNotice] = useState(null);
  const [aliases, setAliases] = useState({});
  const [aliasSaving, setAliasSaving] = useState(false);
  // provider 下拉当前选中；模型行的二级子菜单（定位到点击处）
  const [activeProvider, setActiveProvider] = useState("");
  const [rowMenu, setRowMenu] = useState(null);
  const [menuAliasEditing, setMenuAliasEditing] = useState(false);
  const { copy, copied } = useCopyToClipboard();
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
        setMenuAliasEditing(false);
        return;
      }
      if (name === current) {
        setMenuAliasEditing(false);
        return;
      }
      const ok = await saveAlias(name, realId);
      if (ok) setMenuAliasEditing(false);
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
        .map(([alias, ids]) => {
          const sorted = [...new Set(ids)].sort();
          const selectedCount = sorted.reduce((n, id) => (isSelected(id) ? n + 1 : n), 0);
          return { alias, ids: sorted, selectedCount };
        })
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

  // 当前选中的 provider 分组；activeProvider 失效（过滤后消失/初始为空）时
  // 派生兜底：优先有选中的，否则字母序第一个 —— 不写 effect，免 set-state-in-effect
  const activeGroup = useMemo(
    () =>
      groups.list.find((g) => g.alias === activeProvider) ||
      groups.list.find((g) => g.selectedCount > 0) ||
      groups.list[0] ||
      null,
    [groups.list, activeProvider]
  );

  // ── 变更操作 ──────────────────────────────────────────────────
  const toggleWholeGroup = useCallback((alias, ids) => {
    setEntries((prev) => {
      const wild = `${alias}${WILDCARD_SUFFIX}`;
      if (prev.includes(wild)) {
        const restored = removedByWholeRef.current.get(alias);
        removedByWholeRef.current.delete(alias);
        if (!restored?.length) return prev.filter((e) => e !== wild);
        const withoutWild = prev.filter((e) => e !== wild);
        return [...new Set([...withoutWild, ...restored])];
      }
      const idSet = new Set(ids);
      const removed = prev.filter((e) => idSet.has(e));
      if (removed.length > 0) removedByWholeRef.current.set(alias, removed);
      return [...prev.filter((e) => !idSet.has(e)), wild];
    });
  }, []);

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
  const whole = activeGroup ? wildcardSet.has(activeGroup.alias) : false;

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

      {/* ── 工具栏：provider 下拉 / 只看已选 / 搜索 ───────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <ProviderDropdown
          activeGroup={activeGroup}
          groups={groups.list}
          selectedOnly={selectedOnly}
          onSelect={setActiveProvider}
        />
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
        <div className="relative min-w-0 flex-1 sm:max-w-xs sm:ml-auto">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in this provider…"
            className="h-9 w-full rounded-[10px] border border-transparent bg-surface-2 pl-10 pr-3 text-sm text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>
      {filtering && (
        <div className="-mt-3 text-xs tabular-nums text-text-muted">
          {groups.matched} matching model{groups.matched === 1 ? "" : "s"} across{" "}
          {groups.list.length} provider{groups.list.length === 1 ? "" : "s"}
        </div>
      )}

      {/* ── 选中 provider 的模型卡片 ──────────────────────────── */}
      {!activeGroup ? (
        <Card className="p-10 text-center text-sm text-text-muted">
          {available.length === 0
            ? "No models available."
            : searching || selectedOnly
              ? "No providers match the current filters."
              : "Select a provider to manage its models."}
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="relative flex w-full items-center gap-3 px-4 py-2.5">
            <ProviderIcon
              providerId={activeGroup.alias}
              size={26}
              className="shrink-0 rounded-md object-contain"
              fallbackText={activeGroup.alias.slice(0, 2).toUpperCase()}
            />
            <span className="truncate font-semibold">{activeGroup.alias}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                activeGroup.selectedCount > 0 && activeGroup.selectedCount === activeGroup.ids.length
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-surface-2 text-text-muted"
              )}
            >
              {activeGroup.selectedCount}/{activeGroup.ids.length}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => selectAllInGroup(activeGroup.alias, activeGroup.ids)}
                disabled={whole}
                className="text-[11px] font-medium text-text-muted transition-colors hover:text-brand-500 disabled:opacity-40"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => clearGroup(activeGroup.alias, activeGroup.ids)}
                className="text-[11px] font-medium text-text-muted transition-colors hover:text-brand-500"
              >
                Clear
              </button>
              <div title="Whole provider (uses alias/*)">
                <Toggle
                  size="sm"
                  checked={whole}
                  onChange={() => toggleWholeGroup(activeGroup.alias, activeGroup.ids)}
                />
              </div>
            </div>
            {activeGroup.selectedCount > 0 && (
              <div
                className={cn(
                  "absolute bottom-0 left-0 h-[2px] transition-all duration-300",
                  activeGroup.selectedCount === activeGroup.ids.length ? "bg-green-500" : "bg-brand-500"
                )}
                style={{
                  width: `${Math.round((activeGroup.selectedCount / activeGroup.ids.length) * 100)}%`,
                }}
              />
            )}
          </div>
          {whole && (
            <div className="flex items-center gap-1 border-t border-border-subtle px-4 py-1.5 text-[11px] font-medium text-brand-500">
              <span className="material-symbols-outlined text-[13px]">done_all</span>
              whole provider —{" "}
              <code className="font-mono">{`${activeGroup.alias}${WILDCARD_SUFFIX}`}</code>
            </div>
          )}
          <div className={cn("border-t border-border-subtle p-2", whole && "opacity-80")}>
            {activeGroup.ids.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-text-muted">
                No models match this search in {activeGroup.alias}.
              </div>
            ) : (
              <div className="grid gap-0.5 sm:grid-cols-2">
                {activeGroup.ids.map((id) => (
                  <ModelRow
                    key={id}
                    id={id}
                    checked={isSelected(id)}
                    locked={whole}
                    alias={displayAliasById.get(id) || ""}
                    onToggle={toggleModel}
                    onOpenMenu={(e) => {
                      const x = Math.min(e.clientX, window.innerWidth - 260);
                      const y = Math.min(e.clientY, window.innerHeight - 220);
                      setRowMenu({ id, x: Math.max(8, x), y: Math.max(8, y) });
                      setMenuAliasEditing(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── 模型行的二级子菜单 ────────────────────────────────── */}
      {rowMenu && (
        <RowMenu
          menu={rowMenu}
          alias={displayAliasById.get(rowMenu.id) || ""}
          editing={menuAliasEditing}
          saving={aliasSaving}
          copied={copied}
          onSetAlias={() => setMenuAliasEditing(true)}
          onRemoveAlias={() => {
            const current = displayAliasById.get(rowMenu.id);
            if (current) removeAlias(current);
            setRowMenu(null);
          }}
          onCopy={() => {
            copy(rowMenu.id);
            setRowMenu(null);
          }}
          onCommit={(draft) => commitAlias(rowMenu.id, draft)}
          onCancel={() => setMenuAliasEditing(false)}
          onClose={() => {
            setRowMenu(null);
            setMenuAliasEditing(false);
          }}
        />
      )}
    </div>
  );
}
