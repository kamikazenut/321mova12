"use client";

import { ContentType } from "@/types";
import { cn } from "@/utils/helpers";
import { Close, Server } from "@/utils/icons";
import { Spinner } from "@heroui/react";
import { defineCustomElements } from "vidstack/elements";
import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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

let vidstackElementsPromise: Promise<void> | null = null;

const ensureVidstackElements = (): Promise<void> => {
  if (!vidstackElementsPromise) {
    vidstackElementsPromise = defineCustomElements();
  }

  return vidstackElementsPromise;
};

const DEFAULT_WORKER_PROXY = "https://small-cake-fdee.piracya.workers.dev";
const OPUK_API_BASE_URL = "https://www.opuk.cc";
const OPUK_ORIGIN = "https://www.opuk.cc";
const OPUK_REFERER = "https://www.opuk.cc/";
const OPUK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const OPUK_CITY_LABEL = "Amsterdam";
const OPUK_CITY_PROVIDER = "amsterdam";

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
      label: OPUK_CITY_LABEL,
      provider: OPUK_CITY_PROVIDER,
      isDefault: true,
    };
  } catch {
    return null;
  }
};

interface PlayerElementLike extends HTMLElement {
  currentTime?: number;
  duration?: number;
}

type VideoWithCastSupport = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
};

const CAST_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M3 18h2.8a4.2 4.2 0 0 0-2.8-2.8V18Zm0-5.1a7.1 7.1 0 0 1 7.1 7.1H13A10 10 0 0 0 3 10v2.9Z" fill="currentColor"/>
  <path d="M3 6v2.9A13.1 13.1 0 0 1 16.1 22H19A16 16 0 0 0 3 6Z" fill="currentColor"/>
  <path d="M21 3H3a2 2 0 0 0-2 2v5h2V5h18v14h-5v2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" fill="currentColor"/>
</svg>
`;

const getPlayerCurrentTime = (player: HTMLElement): number => {
  const value = Number((player as PlayerElementLike).currentTime ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const getPlayerDuration = (player: HTMLElement): number => {
  const value = Number((player as PlayerElementLike).duration ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const setPlayerCurrentTime = (player: HTMLElement, time: number): void => {
  (player as PlayerElementLike).currentTime = time;
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
  const [isVidstackReady, setIsVidstackReady] = useState(false);
  const [playerElement, setPlayerElement] = useState<HTMLElement | null>(null);

  const hasReportedErrorRef = useRef(false);
  const hasAppliedStartAtRef = useRef(false);

  const normalizedStartAt = useMemo(
    () => (typeof startAt === "number" && Number.isFinite(startAt) && startAt > 0 ? startAt : 0),
    [startAt],
  );
  const streamUrl = useMemo(
    () => availableSources[activeSourceIndex]?.file ?? null,
    [availableSources, activeSourceIndex],
  );
  const canSwitchSources = availableSources.length > 1;
  const activeSource = availableSources[activeSourceIndex];

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

    const initVidstack = async () => {
      try {
        await ensureVidstackElements();
        if (!disposed) setIsVidstackReady(true);
      } catch {
        if (disposed) return;
        reportFatalError("Failed to initialize player.");
      }
    };

    void initVidstack();
    return () => {
      disposed = true;
    };
  }, [reportFatalError]);

  useEffect(() => {
    let disposed = false;
    hasReportedErrorRef.current = false;
    hasAppliedStartAtRef.current = false;

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
        const hasOpuk = parsedSources.some(
          (source) => source.provider?.toLowerCase() === OPUK_CITY_PROVIDER,
        );
        const opukSource = hasOpuk ? null : await fetchOpukSource(mediaType, mediaId, season, episode);
        const mergedSources = opukSource ? [opukSource, ...parsedSources] : parsedSources;

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
      hasAppliedStartAtRef.current = false;
      setError(null);
      setActiveSourceIndex(nextIndex);
    },
    [activeSourceIndex, availableSources.length],
  );

  const attachPlayerRef = useCallback((node: HTMLElement | null) => {
    setPlayerElement(node);
  }, []);

  const emitPlayerEvent = useCallback(
    (eventType: LocalPlayerEventType, player: HTMLElement) => {
      const eventPayload = {
        type: "LOCAL_PLAYER_EVENT",
        data: {
          event: eventType,
          currentTime: getPlayerCurrentTime(player),
          duration: getPlayerDuration(player),
          mediaId,
          mediaType,
          season,
          episode,
        },
      };

      window.dispatchEvent(new MessageEvent("message", { data: eventPayload }));
    },
    [episode, mediaId, mediaType, season],
  );

  useEffect(() => {
    if (!playerElement || !streamUrl) return;

    setError(null);

    const handlePlay = () => emitPlayerEvent("play", playerElement);
    const handlePause = () => emitPlayerEvent("pause", playerElement);
    const handleSeeked = () => emitPlayerEvent("seeked", playerElement);
    const handleEnded = () => emitPlayerEvent("ended", playerElement);
    const handleTimeUpdate = () => emitPlayerEvent("timeupdate", playerElement);
    const handleCanPlay = () => {
      if (normalizedStartAt <= 0 || hasAppliedStartAtRef.current) return;

      try {
        setPlayerCurrentTime(playerElement, normalizedStartAt);
        hasAppliedStartAtRef.current = true;
      } catch {}
    };
    const handleError = (event: Event) => {
      if (activeSourceIndex + 1 < availableSources.length) {
        switchSource(activeSourceIndex + 1);
        return;
      }

      const fallback = "Stream playback failed. Please try another source.";
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (typeof detail?.message === "string" && detail.message.trim()) {
        reportFatalError(detail.message);
        return;
      }

      reportFatalError(fallback);
    };

    playerElement.addEventListener("play", handlePlay);
    playerElement.addEventListener("pause", handlePause);
    playerElement.addEventListener("seeked", handleSeeked);
    playerElement.addEventListener("ended", handleEnded);
    playerElement.addEventListener("time-update", handleTimeUpdate);
    playerElement.addEventListener("timeupdate", handleTimeUpdate as EventListener);
    playerElement.addEventListener("can-play", handleCanPlay);
    playerElement.addEventListener("canplay", handleCanPlay as EventListener);
    playerElement.addEventListener("error", handleError);

    const fallbackSeekTimer = window.setTimeout(() => {
      if (normalizedStartAt <= 0 || hasAppliedStartAtRef.current) return;
      if (getPlayerDuration(playerElement) <= 0 || getPlayerCurrentTime(playerElement) >= 1) return;

      try {
        setPlayerCurrentTime(playerElement, normalizedStartAt);
        hasAppliedStartAtRef.current = true;
      } catch {}
    }, 1200);

    return () => {
      window.clearTimeout(fallbackSeekTimer);
      playerElement.removeEventListener("play", handlePlay);
      playerElement.removeEventListener("pause", handlePause);
      playerElement.removeEventListener("seeked", handleSeeked);
      playerElement.removeEventListener("ended", handleEnded);
      playerElement.removeEventListener("time-update", handleTimeUpdate);
      playerElement.removeEventListener("timeupdate", handleTimeUpdate as EventListener);
      playerElement.removeEventListener("can-play", handleCanPlay);
      playerElement.removeEventListener("canplay", handleCanPlay as EventListener);
      playerElement.removeEventListener("error", handleError);
    };
  }, [
    activeSourceIndex,
    availableSources.length,
    emitPlayerEvent,
    normalizedStartAt,
    playerElement,
    reportFatalError,
    streamUrl,
    switchSource,
  ]);

  const openCastPicker = useCallback(() => {
    if (!playerElement) return;

    const video = playerElement.querySelector("video") as VideoWithCastSupport | null;
    if (!video) return;

    if (typeof video.webkitShowPlaybackTargetPicker === "function") {
      video.webkitShowPlaybackTargetPicker();
      return;
    }

    if (typeof video.remote?.prompt === "function") {
      void video.remote.prompt().catch(() => {});
    }
  }, [playerElement]);

  useEffect(() => {
    if (!playerElement) return;

    let castClickHandler: ((event: Event) => void) | null = null;

    const hasCastSupport = (video: VideoWithCastSupport | null): boolean =>
      Boolean(
        video &&
          (typeof video.webkitShowPlaybackTargetPicker === "function" ||
            typeof video.remote?.prompt === "function"),
      );

    const syncControlsLayout = () => {
      const fullscreenButton = playerElement.querySelector("media-fullscreen-button");
      if (!fullscreenButton) return;

      const bottomControlsGroup = fullscreenButton.parentElement;
      if (!bottomControlsGroup) return;

      const settingsMenu = playerElement.querySelector("media-menu[part='settings-menu']");
      if (settingsMenu) {
        if (settingsMenu.parentElement !== bottomControlsGroup) {
          bottomControlsGroup.insertBefore(settingsMenu, fullscreenButton);
        }

        settingsMenu.setAttribute("position", "top");
        const settingsTooltip = settingsMenu.querySelector("media-menu-button media-tooltip");
        if (settingsTooltip instanceof HTMLElement) {
          settingsTooltip.setAttribute("position", "top right");
        }
      }

      const video = playerElement.querySelector("video") as VideoWithCastSupport | null;
      const existingCastButton = bottomControlsGroup.querySelector(
        "button[data-local-cast-button='true']",
      ) as HTMLButtonElement | null;

      if (!hasCastSupport(video)) {
        if (existingCastButton) {
          if (castClickHandler) existingCastButton.removeEventListener("click", castClickHandler);
          existingCastButton.remove();
        }
        return;
      }

      let castButton = existingCastButton;
      if (!castButton) {
        castButton = document.createElement("button");
        castButton.type = "button";
        castButton.setAttribute("data-local-cast-button", "true");
        castButton.setAttribute("data-media-button", "");
        castButton.setAttribute("aria-label", "Cast");
        castButton.setAttribute("title", "Cast");
        castButton.innerHTML = CAST_ICON_SVG;
        castClickHandler = () => openCastPicker();
        castButton.addEventListener("click", castClickHandler);
      }

      if (castButton.parentElement !== bottomControlsGroup || castButton.nextElementSibling !== fullscreenButton) {
        bottomControlsGroup.insertBefore(castButton, fullscreenButton);
      }
    };

    syncControlsLayout();

    const observer = new MutationObserver(() => {
      syncControlsLayout();
    });

    observer.observe(playerElement, { childList: true, subtree: true });

    return () => {
      observer.disconnect();

      const castButton = playerElement.querySelector(
        "button[data-local-cast-button='true']",
      ) as HTMLButtonElement | null;
      if (castButton && castClickHandler) {
        castButton.removeEventListener("click", castClickHandler);
      }
    };
  }, [openCastPicker, playerElement, streamUrl]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/90 p-4 text-center text-sm text-default-300">
        {error}
      </div>
    );
  }

  if (isLoading || !streamUrl || !isVidstackReady) {
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

      {createElement(
        "media-player",
        {
          key: streamUrl,
          ref: attachPlayerRef,
          src: streamUrl,
          load: "eager",
          controls: true,
          playsinline: true,
          crossorigin: "anonymous",
          "stream-type": "on-demand",
          "view-type": "video",
          className: "h-full w-full bg-black",
        },
        createElement("media-outlet"),
        createElement("media-community-skin"),
      )}
    </div>
  );
};

export default memo(HlsJsonPlayer);
