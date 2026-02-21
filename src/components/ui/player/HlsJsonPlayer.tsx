"use client";

import { ContentType } from "@/types";
import { cn } from "@/utils/helpers";
import { Close, Server } from "@/utils/icons";
import { Spinner } from "@heroui/react";
import { StrataPlayer, StrataCore } from "strataplayer";
import { HlsPlugin } from "strataplayer/hls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LocalPlayerEventType = "play" | "pause" | "seeked" | "ended" | "timeupdate";

interface PlaylistSource {
  type?: string;
  file?: string;
  label?: string;
  provider?: string;
  default?: boolean;
}

interface PlaylistItem {
  sources?: PlaylistSource[];
}

interface PlaylistResponse {
  playlist?: PlaylistItem[];
}

interface HlsJsonPlayerProps {
  playlistUrl: string;
  mediaId: string | number;
  mediaType: ContentType;
  season?: number;
  episode?: number;
  startAt?: number;
  className?: string;
  onFatalError?: (message: string) => void;
  showFloatingSourceButton?: boolean;
  openSourceMenuSignal?: number;
}

interface StreamSourceOption {
  file: string;
  label: string;
  provider?: string;
  isDefault?: boolean;
}

interface OpukSecureStreamResponse {
  success?: boolean;
  secureUrl?: string;
}

const DEFAULT_WORKER_PROXY = "https://small-cake-fdee.piracya.workers.dev";
const OPUK_API_BASE_URL = "https://www.opuk.cc";
const OPUK_ORIGIN = "https://www.opuk.cc";
const OPUK_REFERER = "https://www.opuk.cc/";
const OPUK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const pickHlsSources = (payload: PlaylistResponse): StreamSourceOption[] => {
  if (!Array.isArray(payload.playlist)) return [];

  const collected: StreamSourceOption[] = [];

  for (const item of payload.playlist) {
    if (!Array.isArray(item.sources)) continue;

    for (const source of item.sources) {
      if (source?.type !== "hls" || typeof source.file !== "string" || source.file.length === 0) {
        continue;
      }

      collected.push({
        file: source.file,
        label: source.label?.trim() || "Auto",
        provider: source.provider,
        isDefault: Boolean(source.default),
      });
    }
  }

  const seen = new Set<string>();
  return collected.filter((source) => {
    if (seen.has(source.file)) return false;
    seen.add(source.file);
    return true;
  });
};

const getWorkerBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_PLAYER_PROXY_URL || DEFAULT_WORKER_PROXY).replace(/\/+$/, "");

const buildWorkerM3u8ProxyUrl = (m3u8Url: string, headers: Record<string, string>): string => {
  const workerBase = getWorkerBaseUrl();
  const params = new URLSearchParams({
    url: m3u8Url,
    headers: JSON.stringify(headers),
  });

  return `${workerBase}/m3u8-proxy/playlist.m3u8?${params.toString()}`;
};

const buildOpukRequestSuffix = (
  mediaType: ContentType,
  mediaId: string | number,
  season?: number,
  episode?: number,
): string | null => {
  if (mediaType === "movie") return String(mediaId);
  if (!season || !episode) return null;
  return `${mediaId}-${season}-${episode}`;
};

const fetchOpukSource = async (
  mediaType: ContentType,
  mediaId: string | number,
  season?: number,
  episode?: number,
): Promise<StreamSourceOption | null> => {
  const suffix = buildOpukRequestSuffix(mediaType, mediaId, season, episode);
  if (!suffix) return null;

  try {
    const response = await fetch(`${OPUK_API_BASE_URL}/api/secure-stream/${suffix}/`, {
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpukSecureStreamResponse;
    if (!payload.success || typeof payload.secureUrl !== "string" || payload.secureUrl.length === 0) {
      return null;
    }

    return {
      file: buildWorkerM3u8ProxyUrl(payload.secureUrl, {
        origin: OPUK_ORIGIN,
        referer: OPUK_REFERER,
        "user-agent": OPUK_USER_AGENT,
      }),
      label: "OPUK (Secondary)",
      provider: "opuk",
      isDefault: false,
    };
  } catch {
    return null;
  }
};

const HlsJsonPlayer: React.FC<HlsJsonPlayerProps> = ({
  playlistUrl,
  mediaId,
  mediaType,
  season,
  episode,
  startAt,
  className,
  onFatalError,
  showFloatingSourceButton = false,
  openSourceMenuSignal,
}) => {
  const [availableSources, setAvailableSources] = useState<StreamSourceOption[]>([]);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const hasReportedErrorRef = useRef(false);

  const normalizedStartAt = useMemo(
    () => (typeof startAt === "number" && Number.isFinite(startAt) && startAt > 0 ? startAt : 0),
    [startAt],
  );
  const plugins = useMemo(() => [new HlsPlugin()], []);
  const streamUrl = useMemo(
    () => availableSources[activeSourceIndex]?.file ?? null,
    [availableSources, activeSourceIndex],
  );
  const canSwitchSources = availableSources.length > 1;
  const activeSource = availableSources[activeSourceIndex];

  const cleanupSubscriptions = useCallback(() => {
    unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRef.current = [];
  }, []);

  const reportFatalError = useCallback(
    (message: string) => {
      setError(message);

      if (hasReportedErrorRef.current) return;
      hasReportedErrorRef.current = true;
      onFatalError?.(message);
    },
    [onFatalError],
  );

  useEffect(() => {
    let disposed = false;
    hasReportedErrorRef.current = false;

    const loadPlaylist = async () => {
      setIsLoading(true);
      setError(null);
      setIsSourceDialogOpen(false);
      setAvailableSources([]);
      setActiveSourceIndex(0);

      try {
        const response = await fetch(playlistUrl, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Playlist request failed (${response.status})`);
        }

        const payload = (await response.json()) as PlaylistResponse;
        const parsedSources = pickHlsSources(payload);
        const hasOpuk = parsedSources.some((source) => source.provider?.toLowerCase() === "opuk");
        const opukSource = hasOpuk ? null : await fetchOpukSource(mediaType, mediaId, season, episode);

        const mergedSources = opukSource ? [...parsedSources, opukSource] : parsedSources;

        if (!mergedSources.length) {
          throw new Error("No HLS stream found in playlist response");
        }

        if (!disposed) {
          const defaultIndex = mergedSources.findIndex((source) => source.isDefault);
          setAvailableSources(mergedSources);
          setActiveSourceIndex(defaultIndex >= 0 ? defaultIndex : 0);
          setIsLoading(false);
        }
      } catch (caughtError) {
        if (disposed) return;

        reportFatalError(caughtError instanceof Error ? caughtError.message : "Failed to load stream");
        setIsLoading(false);
      }
    };

    void loadPlaylist();
    return () => {
      disposed = true;
    };
  }, [episode, mediaId, mediaType, playlistUrl, reportFatalError, season]);

  useEffect(() => {
    if (!availableSources.length) return;
    if (activeSourceIndex < availableSources.length) return;
    setActiveSourceIndex(0);
  }, [activeSourceIndex, availableSources.length]);

  useEffect(() => cleanupSubscriptions, [cleanupSubscriptions]);

  useEffect(() => {
    if (!openSourceMenuSignal) return;
    setIsSourceDialogOpen(true);
  }, [openSourceMenuSignal]);

  useEffect(() => {
    if (!isSourceDialogOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsSourceDialogOpen(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isSourceDialogOpen]);

  const switchSource = useCallback(
    (nextIndex: number) => {
      if (!Number.isFinite(nextIndex) || nextIndex < 0 || nextIndex >= availableSources.length) return;
      if (nextIndex === activeSourceIndex) return;

      hasReportedErrorRef.current = false;
      setError(null);
      setActiveSourceIndex(nextIndex);
    },
    [activeSourceIndex, availableSources.length],
  );

  const onGetInstance = useCallback(
    (core: StrataCore) => {
      cleanupSubscriptions();
      setError(null);

      const emitPlayerEvent = (eventType: LocalPlayerEventType) => {
        const eventPayload = {
          type: "LOCAL_PLAYER_EVENT",
          data: {
            event: eventType,
            currentTime: core.currentTime || 0,
            duration: Number.isFinite(core.duration) ? core.duration : 0,
            mediaId,
            mediaType,
            season,
            episode,
          },
        };

        window.dispatchEvent(new MessageEvent("message", { data: eventPayload }));
      };

      unsubscribeRef.current.push(core.on("play", () => emitPlayerEvent("play")));
      unsubscribeRef.current.push(core.on("pause", () => emitPlayerEvent("pause")));
      unsubscribeRef.current.push(core.on("seek", () => emitPlayerEvent("seeked")));
      unsubscribeRef.current.push(core.on("ended", () => emitPlayerEvent("ended")));
      unsubscribeRef.current.push(core.on("video:timeupdate", () => emitPlayerEvent("timeupdate")));
      unsubscribeRef.current.push(
        core.on("error", (payload) => {
          if (activeSourceIndex + 1 < availableSources.length) {
            switchSource(activeSourceIndex + 1);
            return;
          }

          const fallback = "Stream playback failed. Please try another source.";
          if (typeof payload === "string" && payload.trim()) {
            reportFatalError(payload);
            return;
          }

          reportFatalError(fallback);
        }),
      );

      if (normalizedStartAt > 0) {
        const offCanPlay = core.on("video:canplay", () => {
          core.seek(normalizedStartAt);
          offCanPlay();
        });
        unsubscribeRef.current.push(offCanPlay);

        window.setTimeout(() => {
          if (core.duration > 0 && core.currentTime < 1) {
            core.seek(normalizedStartAt);
          }
        }, 1200);
      }
    },
    [
      activeSourceIndex,
      availableSources.length,
      cleanupSubscriptions,
      episode,
      mediaId,
      mediaType,
      normalizedStartAt,
      reportFatalError,
      season,
      switchSource,
    ],
  );

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/90 p-4 text-center text-sm text-default-300">
        {error}
      </div>
    );
  }

  if (isLoading || !streamUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/90">
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full bg-black", className)}>
      {showFloatingSourceButton && availableSources.length > 0 ? (
        <div className="absolute left-1/2 top-3 z-[72] -translate-x-1/2">
          <button
            type="button"
            onClick={() => setIsSourceDialogOpen(true)}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm transition hover:brightness-110",
              !canSwitchSources && "cursor-default opacity-80",
            )}
            aria-label="Select stream source"
          >
            <Server size={14} />
            <span>{canSwitchSources ? "Select a server" : "Current server"}</span>
          </button>
          {activeSource ? (
            <p className="mt-1 max-w-48 truncate text-center text-[11px] text-white/80" title={activeSource.label}>
              {activeSource.label}
            </p>
          ) : null}
        </div>
      ) : null}

      {isSourceDialogOpen ? (
        <div
          className="absolute inset-0 z-[10100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setIsSourceDialogOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-white/15 bg-black/95 p-4 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex justify-center">
              <button
                type="button"
                onClick={() => setIsSourceDialogOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
              >
                <Close size={14} />
                <span>Close</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {availableSources.map((source, index) => {
                const isActive = index === activeSourceIndex;
                const providerLabel = source.provider ? source.provider.toUpperCase() : "STREAM";

                return (
                  <button
                    key={`${source.file}-${index}`}
                    type="button"
                    onClick={() => {
                      switchSource(index);
                      setIsSourceDialogOpen(false);
                    }}
                    className={cn(
                      "flex min-h-24 flex-col items-start justify-between rounded-xl border px-3 py-3 text-left transition",
                      isActive
                        ? "border-blue-400/70 bg-gradient-to-br from-blue-500/35 to-violet-500/35 shadow-[0_0_0_1px_rgba(96,165,250,0.3)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90">
                      {providerLabel}
                    </span>
                    <span className="w-full truncate text-sm font-semibold text-white" title={source.label}>
                      {source.label}
                    </span>
                    <span className="text-[11px] text-white/65">
                      {isActive ? "Active" : index === 0 ? "Primary" : "Secondary"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <StrataPlayer
        key={streamUrl}
        src={streamUrl}
        type="hls"
        plugins={plugins}
        autoPlay={false}
        loop={false}
        screenshot={false}
        fullscreenWeb={false}
        pip={true}
        setting={true}
        hotKey={true}
        centerControls={true}
        videoFit="contain"
        useSSR={false}
        container="h-full w-full bg-black"
        onGetInstance={onGetInstance}
      />
    </div>
  );
};

export default HlsJsonPlayer;
