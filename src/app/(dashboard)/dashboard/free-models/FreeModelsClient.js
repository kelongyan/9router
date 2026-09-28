"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Button, Badge } from "@/shared/components";
import { cn } from "@/shared/utils/cn";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

function formatLatency(ms) {
  if (ms == null) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

// Latency tiers for verified-usable free models: fast / warm / slow.
function latencyTone(ms) {
  if (ms == null) return "text-text-muted";
  if (ms < 3000) return "text-green-500";
  if (ms < 8000) return "text-yellow-500";
  return "text-orange-500";
}

function BrandIcon({ textIcon, color, size = "md" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold",
        size === "md" ? "size-9 text-xs" : "size-7 text-[10px]"
      )}
      style={color ? { backgroundColor: `${color}26`, color } : undefined}
    >
      {textIcon || "?"}
    </div>
  );
}

BrandIcon.propTypes = {
  textIcon: PropTypes.string,
  color: PropTypes.string,
  size: PropTypes.oneOf(["md", "sm"]),
};

function ModelCard({ model, fullId }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-surface-2 bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-brand-500/40">
      <span className="size-2 shrink-0 rounded-full bg-green-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={model.name}>
            {model.name}
          </span>
          {model.source === "live" && (
            <Badge variant="info" size="sm">
              live
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={() => copy(fullId)}
          title="Copy model ID"
          className="block max-w-full truncate text-left font-mono text-[11px] text-text-muted hover:text-brand-500"
        >
          {copied ? "Copied!" : fullId}
        </button>
      </div>
      <span className={cn("shrink-0 text-xs tabular-nums", latencyTone(model.latencyMs))}>
        {formatLatency(model.latencyMs)}
      </span>
    </div>
  );
}

ModelCard.propTypes = {
  model: PropTypes.shape({
    name: PropTypes.string.isRequired,
    latencyMs: PropTypes.number,
    source: PropTypes.string,
  }).isRequired,
  fullId: PropTypes.string.isRequired,
};

function ProbeButton({ onClick, label, disabled }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}>
      <span className={cn("material-symbols-outlined text-[15px]", disabled && "animate-spin")}>
        {disabled ? "progress_activity" : "radar"}
      </span>
      {label}
    </Button>
  );
}

ProbeButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

function ProviderCard({ group, onProbe, probing }) {
  const availableCount = group.models.length;
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandIcon textIcon={group.textIcon} color={group.color} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold leading-tight">{group.displayName}</h2>
            <span className="font-mono text-xs text-text-muted">{group.alias}</span>
          </div>
          {group.needsAuth ? (
            <Badge variant="warning" size="sm">
              Login required
            </Badge>
          ) : (
            <Badge variant="success" size="sm">
              <span className="mr-1">{availableCount}</span>
              <span>Available</span>
            </Badge>
          )}
        </div>
        {group.probeable && (
          <ProbeButton onClick={() => onProbe(group.id)} label="Probe" disabled={probing} />
        )}
      </div>

      {group.needsAuth ? (
        <p className="rounded-lg border border-dashed border-surface-2 px-3 py-3 text-sm text-text-muted">
          <span>{group.pendingCount}</span> <span>free models will show up here once you add a login or API key for this provider.</span>
        </p>
      ) : group.models.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-surface-2 px-3 py-6 text-sm text-text-muted">
          {probing ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              <span>Probing...</span>
            </>
          ) : (
            <span>No models available right now.</span>
          )}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {group.models.map((m) => (
            <ModelCard key={m.id} model={m} fullId={`${group.alias}/${m.id}`} />
          ))}
        </div>
      )}
    </Card>
  );
}

ProviderCard.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.string.isRequired,
    alias: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    probeable: PropTypes.bool.isRequired,
    needsAuth: PropTypes.bool.isRequired,
    pendingCount: PropTypes.number.isRequired,
    models: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  onProbe: PropTypes.func.isRequired,
  probing: PropTypes.bool.isRequired,
};

export default function FreeModelsClient() {
  const [snapshot, setSnapshot] = useState(null);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/free-models", { headers: { "Cache-Control": "no-store" } });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        setProbing(Boolean(data.probing));
        return { probing: Boolean(data.probing), empty: !data.providers?.length };
      }
    } catch {
      /* keep previous state */
    }
    return { probing: false, empty: true };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      const { probing: isProbing, empty } = await load();
      if (cancelled) return;
      setLoading(false);
      // Keep polling while a probe runs or until candidates arrive from the
      // background feed refresh (the first snapshot can legitimately be empty).
      if (isProbing || empty) timer = setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const startProbe = useCallback(
    async (providerId) => {
      setProbing(true);
      try {
        await fetch("/api/free-models/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(providerId ? { provider: providerId } : {}),
        });
      } catch {
        /* snapshot poll reports progress */
      }
      const poll = async () => {
        const { probing: isProbing } = await load();
        if (isProbing) setTimeout(poll, 3000);
      };
      setTimeout(poll, 1500);
    },
    [load]
  );

  const groups = snapshot?.providers || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Free Models</h1>
          <p className="text-sm text-text-muted">
            Free models verified by live probes through the gateway — stale catalog entries show as unavailable instead of wasting your time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {snapshot?.lastProbeAt ? (
            <span className="text-xs text-text-muted tabular-nums">
              {new Date(snapshot.lastProbeAt).toLocaleString()}
            </span>
          ) : null}
          <Button onClick={() => startProbe()} disabled={probing}>
            {probing ? "Probing..." : "Probe all"}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-text-muted">
          <span className="material-symbols-outlined inline-block animate-spin text-[20px]">progress_activity</span>
          <p className="mt-2">Loading...</p>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center text-text-muted">No free models detected.</Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <ProviderCard key={group.id} group={group} onProbe={startProbe} probing={probing} />
          ))}
        </div>
      )}
    </div>
  );
}
