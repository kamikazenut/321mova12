import { siteConfig } from "@/config/site";
import { cn } from "@/utils/helpers";
import { getTvShowPlayers } from "@/utils/players";
import { Card, Skeleton } from "@heroui/react";
import { useDisclosure, useDocumentTitle, useIdle, useLocalStorage } from "@mantine/hooks";
import dynamic from "next/dynamic";
import { parseAsInteger, useQueryState } from "nuqs";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Episode, TvShowDetails } from "tmdb-ts";
import useBreakpoints from "@/hooks/useBreakpoints";
import { ADS_WARNING_STORAGE_KEY, SpacingClasses } from "@/utils/constants";
import { usePlayerEvents } from "@/hooks/usePlayerEvents";
import useAdBlockDetector from "@/hooks/useAdBlockDetector";
import useSupabaseUser from "@/hooks/useSupabaseUser";
import { isPremiumUser } from "@/utils/billing/premium";
const AdsWarning = dynamic(() => import("@/components/ui/overlay/AdsWarning"));
const PlayerAccessNotice = dynamic(() => import("@/components/ui/overlay/PlayerAccessNotice"));
const HlsJsonPlayer = dynamic(() => import("@/components/ui/player/HlsJsonPlayer"));
const TvShowPlayerHeader = dynamic(() => import("./Header"));
const TvShowPlayerSourceSelection = dynamic(() => import("./SourceSelection"));
const TvShowPlayerEpisodeSelection = dynamic(() => import("./EpisodeSelection"));

export interface TvShowPlayerProps {
  tv: TvShowDetails;
  id: number;
  seriesName: string;
  seasonName: string;
  episode: Episode;
  episodes: Episode[];
  nextEpisodeNumber: number | null;
  prevEpisodeNumber: number | null;
  startAt?: number;
}

const TvShowPlayer: React.FC<TvShowPlayerProps> = ({
  tv,
  id,
  episode,
  episodes,
  startAt,
  ...props
}) => {
  const [seen] = useLocalStorage<boolean>({
    key: ADS_WARNING_STORAGE_KEY,
    getInitialValueInEffect: false,
  });

  const { data: user, isLoading: isUserLoading } = useSupabaseUser();
  const { isAdBlockDetected, isChecking: isAdBlockChecking } = useAdBlockDetector();
  const isPremium = isPremiumUser(user);

  const { mobile } = useBreakpoints();
  const allPlayers = useMemo(
    () => getTvShowPlayers(id, episode.season_number, episode.episode_number, startAt),
    [episode.episode_number, episode.season_number, id, startAt],
  );
  const canUse321Player =
    Boolean(user) &&
    !isUserLoading &&
    (isPremium || (!isAdBlockChecking && !isAdBlockDetected));
  const missing321Requirements = useMemo(() => {
    if (isUserLoading || isAdBlockChecking) return [];

    const missing: string[] = [];
    if (!user) missing.push("Sign in to your account.");
    if (!isPremium && isAdBlockDetected) missing.push("Disable your ad blocker for this site.");
    return missing;
  }, [isAdBlockChecking, isAdBlockDetected, isPremium, isUserLoading, user]);
  const players = useMemo(() => {
    if (canUse321Player) return allPlayers;

    const filteredPlayers = allPlayers.filter((player) => player.mode !== "playlist_json");
    return filteredPlayers.length > 0 ? filteredPlayers : allPlayers;
  }, [allPlayers, canUse321Player]);
  const [dismissedPlayerNotice, setDismissedPlayerNotice] = useState(false);

  const idle = useIdle(3000);
  const [sourceOpened, sourceHandlers] = useDisclosure(false);
  const [episodeOpened, episodeHandlers] = useDisclosure(false);
  const [selectedSource, setSelectedSource] = useQueryState<number>(
    "src",
    parseAsInteger.withDefault(0),
  );
  const [streamSourceMenuSignal, setStreamSourceMenuSignal] = useState(0);

  usePlayerEvents({
    saveHistory: true,
    trackUiState: false,
    media: { id, type: "tv" },
    metadata: { season: episode.season_number, episode: episode.episode_number },
  });
  useDocumentTitle(
    `Play ${props.seriesName} - ${props.seasonName} - ${episode.name} | ${siteConfig.name}`,
  );

  useEffect(() => {
    setDismissedPlayerNotice(false);
  }, [missing321Requirements.join("|")]);

  useEffect(() => {
    if (!players.length) return;
    if (selectedSource < players.length) return;
    void setSelectedSource(0);
  }, [players.length, selectedSource, setSelectedSource]);

  const PLAYER = useMemo(() => players[selectedSource] || players[0], [players, selectedSource]);
  const isPlaylistJsonPlayer = PLAYER.mode === "playlist_json";
  const handlePrimaryPlayerError = useCallback(() => {
    const fallbackIndex = players.findIndex((_, index) => index > selectedSource);
    if (fallbackIndex < 0) return;
    void setSelectedSource(fallbackIndex);
  }, [players, selectedSource, setSelectedSource]);
  const handleOpenStreamSourceMenu = useCallback(() => {
    setStreamSourceMenuSignal((value) => value + 1);
  }, []);

  return (
    <>
      <AdsWarning />
      <PlayerAccessNotice
        isOpen={missing321Requirements.length > 0 && !dismissedPlayerNotice}
        onClose={() => setDismissedPlayerNotice(true)}
        missingRequirements={missing321Requirements}
      />

      <div className={cn("relative overflow-hidden", SpacingClasses.reset)}>
        <TvShowPlayerHeader
          id={id}
          episode={episode}
          hidden={idle && !mobile}
          selectedSource={selectedSource}
          onOpenSource={sourceHandlers.open}
          onOpenServer={isPlaylistJsonPlayer ? handleOpenStreamSourceMenu : undefined}
          showServerButton={isPlaylistJsonPlayer}
          onOpenEpisode={episodeHandlers.open}
          {...props}
        />

        <Card shadow="md" radius="none" className="relative h-screen overflow-hidden">
          <Skeleton className="absolute h-full w-full" />
          {seen && (
            PLAYER.mode === "playlist_json" ? (
              <HlsJsonPlayer
                key={PLAYER.source}
                playlistUrl={PLAYER.source}
                mediaId={id}
                mediaType="tv"
                season={episode.season_number}
                episode={episode.episode_number}
                startAt={startAt}
                onFatalError={handlePrimaryPlayerError}
                className="z-10 h-full"
                showFloatingSourceButton={false}
                openSourceMenuSignal={streamSourceMenuSignal}
              />
            ) : (
              <iframe
                allowFullScreen
                key={PLAYER.title}
                src={PLAYER.source}
                className={cn("z-10 h-full", { "pointer-events-none": idle && !mobile })}
              />
            )
          )}
        </Card>
      </div>

      <TvShowPlayerSourceSelection
        opened={sourceOpened}
        onClose={sourceHandlers.close}
        players={players}
        selectedSource={selectedSource}
        setSelectedSource={setSelectedSource}
      />
      <TvShowPlayerEpisodeSelection
        id={id}
        opened={episodeOpened}
        onClose={episodeHandlers.close}
        episodes={episodes}
      />
    </>
  );
};

export default memo(TvShowPlayer);
