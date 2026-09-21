"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { translate } from "@/i18n/runtime";

// Providers can expose several hundred models (Cline currently returns ~450), so the
// list is capped: past this point the search box is the way in, and rendering the whole
// thing would only slow the modal down.
const RENDER_CAP = 500;

/**
 * Searchable multi-select for a provider's live model catalog.
 *
 * Replaces the old "import everything from /models" behaviour: the caller fetches the
 * list, the user narrows it down and picks what should actually be added to the model
 * list. Models already present are shown locked instead of being silently skipped.
 */
export default function ModelPickerModal({ isOpen, title, models, existingIds, busy, onConfirm, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [wasOpen, setWasOpen] = useState(isOpen);

  // A fresh open starts from a clean slate — carrying the previous selection over
  // would make it easy to add models from a list the user never looked at. Adjusting
  // state during render (instead of in an effect) is React's recommended way to reset
  // state when a prop changes, and avoids a cascading render.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setQuery("");
      setSelected(new Set());
    }
  }

  const existing = useMemo(() => new Set(existingIds || []), [existingIds]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = models || [];
    if (terms.length === 0) return list;
    // Every space-separated term must match, so "glm flash" finds z-ai/glm-5.3-flash.
    return list.filter((m) => {
      const hay = `${m.id} ${m.name || ""}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [models, query]);

  const visible = filtered.slice(0, RENDER_CAP);
  const selectableIds = useMemo(
    () => filtered.filter((m) => !existing.has(m.id)).map((m) => m.id),
    [filtered, existing],
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  };

  const footer = (
    <>
      <span className="mr-auto text-xs text-text-muted">
        {translate("Selected")} {selected.size}
      </span>
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        {translate("Cancel")}
      </Button>
      <Button onClick={() => onConfirm([...selected])} disabled={busy || selected.size === 0}>
        {busy ? translate("Adding...") : translate("Add selected")}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      closeOnOverlay={!busy}
      title={title || translate("Add models")}
      size="full"
      footer={footer}
    >
      <div className="flex flex-col gap-2">
        {/* Search stays pinned while the list scrolls */}
        <div className="sticky -top-6 z-10 -mx-6 -mt-6 mb-1 border-b border-border-subtle bg-surface px-6 pt-6 pb-3">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate("Search models...")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span>
              {filtered.length} / {(models || []).length}
            </span>
            {selectableIds.length > 0 && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="rounded px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10"
              >
                {translate("Select all shown")} ({selectableIds.length})
              </button>
            )}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-sidebar hover:text-text-main"
              >
                {translate("Clear selection")}
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">{translate("No models match")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {visible.map((m) => {
              const isExisting = existing.has(m.id);
              const isSelected = selected.has(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    isExisting
                      ? "cursor-not-allowed border-border-subtle opacity-55"
                      : isSelected
                        ? "cursor-pointer border-primary/40 bg-primary/5"
                        : "cursor-pointer border-border hover:bg-sidebar/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--color-primary)]"
                    checked={isExisting || isSelected}
                    disabled={isExisting}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <code className="truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted">{m.id}</code>
                    {m.name && m.name !== m.id && (
                      <span className="truncate text-[10px] italic text-text-muted/70">{m.name}</span>
                    )}
                  </span>
                  {isExisting && (
                    <span className="shrink-0 text-[10px] font-semibold text-text-muted">{translate("Added")}</span>
                  )}
                </label>
              );
            })}
            {filtered.length > visible.length && (
              <p className="py-2 text-center text-xs text-text-muted">
                {translate("Showing first")} {visible.length} — {translate("narrow the search to see the rest")}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

ModelPickerModal.propTypes = {
  isOpen: PropTypes.bool,
  title: PropTypes.string,
  models: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
  })),
  existingIds: PropTypes.arrayOf(PropTypes.string),
  busy: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
