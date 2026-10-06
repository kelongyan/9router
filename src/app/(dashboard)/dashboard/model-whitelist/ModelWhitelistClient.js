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

// ── 左栏：provider 导航（常驻，状态一眼可扫）────────────────────
function ProviderNav({ groups, activeAlias, selectedOnly, onToggleSelectedOnly, onSelect }) {
  return (
    <Card
      padding="none"
      className="flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden lg:sticky lg:top-4"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <span className="material-symbols-outlined text-[16px] text-text-muted">widgets</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          服务商
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-text-muted">{groups.length}</span>
        <button
          type="button"
          onClick={onToggleSelectedOnly}
          aria-pressed={selectedOnly}
          title="只显示有选中模型的服务商"
          className={cn(
            "flex size-6 items-center justify-center rounded-md transition-colors",
            selectedOnly
              ? "bg-brand-500/10 text-brand-500"
              : "text-text-muted hover:bg-surface-2 hover:text-text-main"
          )}
        >
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
        </button>
      </div>
      <div className="overflow-y-auto p-1.5">
        {groups.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            {selectedOnly ? "没有已选中模型的服务商。" : "暂无服务商。"}
          </div>
        ) : (
          groups.map((g) => {
            const active = g.alias === activeAlias;
            const full = g.selectedCount === g.ids.length && g.ids.length > 0;
            return (
              <button
                key={g.alias}
                type="button"
                onClick={() => onSelect(g.alias)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-brand-500/[0.08] shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    : "hover:bg-surface-2/60"
                )}
              >
                <ProviderIcon
                  providerId={g.alias}
                  size={20}
                  className="shrink-0 rounded-md object-contain"
                  fallbackText={g.alias.slice(0, 2).toUpperCase()}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    active ? "font-semibold text-text-main" : "text-text-main/90"
                  )}
                >
                  {g.alias}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    full
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : g.selectedCount > 0
                        ? "bg-brand-500/10 text-brand-500"
                        : "text-text-muted"
                  )}
                >
                  {g.selectedCount}/{g.ids.length}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}

ProviderNav.propTypes = {
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      alias: PropTypes.string.isRequired,
      ids: PropTypes.arrayOf(PropTypes.string).isRequired,
      selectedCount: PropTypes.number.isRequired,
    })
  ).isRequired,
  activeAlias: PropTypes.string,
  selectedOnly: PropTypes.bool.isRequired,
  onToggleSelectedOnly: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};

// ── 右栏模型行：勾选白名单 + 行内别名编辑（无浮层，Enter/失焦保存）──
function ModelRow({ id, checked, locked, alias, editing, saving, onToggle, onStartEdit, onCommit, onCancel }) {
  const { copy, copied } = useCopyToClipboard();
  // 别名：单击复制、双击编辑。延迟复制给双击判定留窗口，dblclick 到达即取消。
  const aliasClickTimer = useRef(null);
  useEffect(() => () => clearTimeout(aliasClickTimer.current), []);
  const copyAlias = () => {
    clearTimeout(aliasClickTimer.current);
    aliasClickTimer.current = setTimeout(() => copy(alias, "alias"), 250);
  };
  const editAlias = () => {
    clearTimeout(aliasClickTimer.current);
    onStartEdit();
  };
  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
        checked ? "bg-brand-500/[0.08]" : "hover:bg-surface-2/60",
        locked && "opacity-70"
      )}
    >
      <label className="mt-0.5 flex shrink-0 cursor-pointer items-center">
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
            checked ? "border-brand-500 bg-brand-500" : "border-surface-3 group-hover:border-brand-500/60",
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
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs leading-4" title={id}>
          {id}
        </div>
        {editing ? (
          <input
            autoFocus
            defaultValue={alias}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit(e.currentTarget.value);
              if (e.key === "Escape") onCancel();
            }}
            onBlur={(e) => onCommit(e.currentTarget.value)}
            placeholder="别名，如 GLM-5.2"
            className="mt-0.5 h-5 w-full max-w-xs border-b border-brand-500/50 bg-transparent font-mono text-[11px] leading-4 text-brand-500 placeholder-text-muted/60 outline-none"
          />
        ) : alias ? (
          <button
            type="button"
            onClick={copyAlias}
            onDoubleClick={editAlias}
            title="单击复制别名 · 双击编辑"
            className={cn(
              "flex max-w-full items-center gap-1 text-left font-mono text-[11px] leading-4",
              copied === "alias" ? "text-green-500" : "text-brand-500 hover:underline"
            )}
          >
            <span className="material-symbols-outlined shrink-0 text-[12px] leading-4">
              {copied === "alias" ? "check" : "arrow_forward"}
            </span>
            <span className="truncate">{copied === "alias" ? "已复制" : alias}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            className="block text-left font-mono text-[11px] leading-4 text-text-muted opacity-0 transition-opacity hover:text-brand-500 group-hover:opacity-70"
          >
            + 起别名
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => copy(id, "id")}
        title="复制模型 ID"
        className="mt-0.5 shrink-0 rounded-md p-0.5 text-text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-brand-500 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[14px]">
          {copied === "id" ? "check" : "content_copy"}
        </span>
      </button>
    </div>
  );
}

ModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  locked: PropTypes.bool.isRequired,
  alias: PropTypes.string,
  editing: PropTypes.bool.isRequired,
  saving: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onStartEdit: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
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
  const [notice, setNotice] = useState(null);
  const [aliases, setAliases] = useState({});
  const [aliasSaving, setAliasSaving] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState(null);
  // 记录启用整组时被清掉的精确 id（alias → ids[]），关闭时恢复，避免 on→off 一圈悄悄丢选择
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
        if (alive) flash(`加载失败：${e.message}`, "err");
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

  // ── 模型别名（target → alias）─────────────────────────────────
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
        flash(`别名「${alias}」已保存，/v1/models 对外显示新名字。`);
        return true;
      } catch (e) {
        flash(`别名保存失败：${e.message}`, "err");
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
        flash(`别名「${alias}」已删除。`);
        return true;
      } catch (e) {
        flash(`别名删除失败：${e.message}`, "err");
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
      setEditingAliasId(null);
      if (!name) {
        if (current) await removeAlias(current);
        return;
      }
      if (name === current) return;
      await saveAlias(name, realId);
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
  // 派生兜底：优先有选中的，否则字母序第一个 —— 派生而非 effect
  const [activeProvider, setActiveProvider] = useState("");
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
      flash("已保存，/v1/models 现按此白名单输出。");
    } catch (e) {
      flash(`保存失败：${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }, [entries, flash]);

  const clearAll = useCallback(async () => {
    if (!window.confirm("确定清空白名单？/v1/models 将恢复返回全部模型。")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/models/whitelist", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries([]);
      setSavedEntries([]);
      removedByWholeRef.current.clear();
      flash("已清空，过滤已关闭。");
    } catch (e) {
      flash(`清空失败：${e.message}`, "err");
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
  const full = activeGroup && activeGroup.selectedCount === activeGroup.ids.length && activeGroup.ids.length > 0;

  return (
    <div className="space-y-4">
      {/* ── 页头 ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">模型白名单</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            只有白名单内的模型会出现在 <code className="font-mono">/v1/models</code> 的返回中——公网与
            <code className="font-mono">127.0.0.1</code> 一致。留空表示不过滤。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={clearAll} disabled={saving || isEmpty}>
            清空
          </Button>
          <Button onClick={save} disabled={saving || !dirty} icon="save">
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isEmpty ? "default" : "success"} dot>
          {isEmpty ? "过滤未开启" : "过滤已开启"}
        </Badge>
        {dirty && <Badge variant="warning">有未保存的修改</Badge>}
        <span className="text-xs text-text-muted">
          <span className="font-semibold tabular-nums text-text-main">{selectedModelCount}</span>{" "}
          / <span className="tabular-nums">{available.length}</span> 个模型已选 · 白名单{" "}
          <span className="tabular-nums">{entries.length}</span> 条
          {Object.keys(aliases).length > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">{Object.keys(aliases).length}</span> 个别名
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

      {/* ── 双栏：左 provider 导航 / 右工作区 ─────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ProviderNav
          groups={groups.list}
          activeAlias={activeGroup?.alias}
          selectedOnly={selectedOnly}
          onToggleSelectedOnly={() => setSelectedOnly((v) => !v)}
          onSelect={(alias) => {
            setActiveProvider(alias);
            setEditingAliasId(null);
          }}
        />

        {!activeGroup ? (
          <Card className="p-10 text-center text-sm text-text-muted">
            {available.length === 0
              ? "暂无可用模型。"
              : "当前过滤条件下没有服务商。"}
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            {/* 工作区头：provider 身份 + 计数 + 操作 + 搜索 */}
            <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
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
                  full
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
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => clearGroup(activeGroup.alias, activeGroup.ids)}
                  className="text-[11px] font-medium text-text-muted transition-colors hover:text-brand-500"
                >
                  清空
                </button>
                <div title="整组开启（写入 alias/*）">
                  <Toggle
                    size="sm"
                    checked={whole}
                    onChange={() => toggleWholeGroup(activeGroup.alias, activeGroup.ids)}
                  />
                </div>
              </div>
              {filtering && (
                <span className="w-full text-[11px] tabular-nums text-text-muted">
                  {groups.matched} 个匹配模型 · 跨 {groups.list.length} 个服务商
                </span>
              )}
              {activeGroup.selectedCount > 0 && (
                <div
                  className={cn(
                    "absolute bottom-0 left-0 h-[2px] transition-all duration-300",
                    full ? "bg-green-500" : "bg-brand-500"
                  )}
                  style={{
                    width: `${Math.round(
                      (activeGroup.selectedCount / activeGroup.ids.length) * 100
                    )}%`,
                  }}
                />
              )}
            </div>
            {whole && (
              <div className="flex items-center gap-1 border-t border-border-subtle px-4 py-1.5 text-[11px] font-medium text-brand-500">
                <span className="material-symbols-outlined text-[13px]">done_all</span>
                整组已开启 —{" "}
                <code className="font-mono">{`${activeGroup.alias}${WILDCARD_SUFFIX}`}</code>
              </div>
            )}
            {/* 搜索 + 模型列表（限高滚动，头卡常驻） */}
            <div className="border-t border-border-subtle p-3">
              <div className="relative mb-2">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
                  search
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`在 ${activeGroup.alias} 内搜索…`}
                  className="h-9 w-full rounded-[10px] border border-transparent bg-surface-2 pl-10 pr-3 text-sm text-text-main placeholder-text-muted/70 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div className="max-h-[58vh] overflow-y-auto">
                {activeGroup.ids.length === 0 ? (
                  <div className="px-2 py-8 text-center text-sm text-text-muted">
                    {activeGroup.alias} 内没有匹配此搜索的模型。
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
                        editing={editingAliasId === id}
                        saving={aliasSaving}
                        onToggle={toggleModel}
                        onStartEdit={() => setEditingAliasId(id)}
                        onCommit={(draft) => commitAlias(id, draft)}
                        onCancel={() => setEditingAliasId(null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
