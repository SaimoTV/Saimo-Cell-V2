// Tipos para o aplicativo Saimo-v2 TV

// ===== CHANNEL TYPES =====

export interface ChannelDRM {
    clearKey?: string;
    widevine?: string;
}

export interface ChannelStream {
    url: string;
    quality?: string;
    /** O que diferencia a fonte das outras do canal ("Temporada 3"), quando o catálogo sabe. */
    name?: string;
    headers?: Record<string, string>;
    drm?: ChannelDRM;
}

export interface Channel {
    id: string;
    name: string;
    url: string;
    category: string;
    logo: string;
    channelNumber?: number;
    drm?: ChannelDRM;
    headers?: Record<string, string>;
    streams?: ChannelStream[];
    epgId?: string;
}

// ===== EPG TYPES =====

export interface Program {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    category?: string;
    rating?: string;
    thumbnail?: string;
    isLive?: boolean;
    episodeInfo?: {
        season?: number;
        episode?: number;
        episodeTitle?: string;
    };
}

export interface ChannelEPG {
    channelId: string;
    programs: Program[];
}

export interface CurrentProgram {
    current: Program | null;
    next: Program | null;
    progress: number; // 0-100
    remaining?: number; // minutos restantes
}

// ===== SETTINGS TYPES =====

export interface Settings {
    adultPin: string;
    adultUnlocked: boolean;
    autoplay: boolean;
    theme: 'dark' | 'light';
}

// ===== CATEGORY TYPES =====

export type CategoryId =
    | 'TV Aberta'
    | 'Filmes'
    | 'Series'
    | 'Esportes'
    | 'Noticias'
    | 'Infantil'
    | 'Documentarios'
    | 'Entretenimento'
    | 'Musica'
    | 'Internacionais'
    | 'Adulto';

export interface Category {
    id: CategoryId;
    name: string;
    icon: string;
}

// ===== MEDIA TYPES (MOVIES/SERIES) =====

export interface CastMember {
    id: number;
    name: string;
    character: string;
    photo: string | null;
}

export interface TMDBData {
    id: number;
    imdbId?: string;
    title: string;
    originalTitle?: string;
    tagline?: string;
    overview: string;
    status?: string;
    language?: string;
    releaseDate?: string;
    year: string;
    runtime?: number;
    rating: number;
    voteCount?: number;
    popularity?: number;
    certification?: string;
    genres: string[];
    poster: string;
    posterHD?: string;
    backdrop?: string;
    backdropHD?: string;
    logo?: string;
    /** URL direta MP4/HLS do trailer, quando publicada no catálogo. */
    trailer?: string;
    cast: CastMember[];
    // Novos campos
    recommendations?: MediaItem[];
    director?: string;
    writer?: string;
    productionCompany?: string;
}

// ===== SERIES TYPES (antes de MediaItem para evitar erro de referência) =====

export interface Episode {
    episode: number;
    name: string;
    url: string;
    id: string;
    logo?: string;
    sources?: MediaSource[];
}

export interface MediaSource {
    url: string;
    label?: string;
    headers?: Record<string, string>;
    bingeGroup?: string;
    addonId?: string;
    addonName?: string;
    infoHash?: string;
    fileIdx?: number;
    sources?: string[];
    subtitles?: AddonSubtitle[];
    externalUrl?: string;
    ytId?: string;
    isTorrent?: boolean;
    notWebReady?: boolean;
    filename?: string;
    videoSize?: number;
    videoHash?: string;
    kind?: AddonStreamKind;
}

export interface SeriesEpisodes {
    [season: string]: Episode[];
}

export interface MediaItem {
    id: string;
    name: string;
    url: string;
    category: string;
    categoryLabel?: string;
    type: 'movie' | 'tv';
    isAdult: boolean;
    logo?: string;
    imdbId?: string;
    addonId?: string;
    addonRawId?: string;
    addonMeta?: AddonMeta;
    totalSeasons?: number;
    totalEpisodes?: number;
    tmdb?: TMDBData;
    episodes?: SeriesEpisodes;
    /** Fontes em ordem de preferência; o player avança quando uma falha. */
    sources?: MediaSource[];
    /** Pedaço do catálogo remoto que contém os episódios da série. */
    vodChunk?: number;
}

export interface MediaCategory {
    id: string;
    name: string;
    items: MediaItem[];
    lastUpdated?: number;
}

export type MediaFilterType = 'all' | 'movie' | 'tv' | 'animes' | 'doramas' | 'novelas' | 'kids';
export type MediaSortType = 'rating' | 'year' | 'name' | 'popularity';

// Série com episódios (tipo legado, usar MediaItem com episodes)
export interface SeriesItem {
    id: string;
    name: string;
    category: string;
    type: 'series';
    isAdult: boolean;
    episodes: SeriesEpisodes;
    tmdb?: TMDBData;
}

// Histórico de onde o usuário parou na série
export interface SeriesProgress {
    seriesId: string;
    season: number;
    episode: number;
    episodeId: string;
    watchedAt: number;
}

// ===== DOWNLOAD TYPES =====

export type DownloadStatus =
    | 'queued'
    | 'downloading'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface DownloadMediaSnapshot {
    id: string;
    name: string;
    type: 'movie' | 'tv';
    tmdb?: {
        title: string;
        poster?: string;
        year?: string;
        rating?: number;
    };
}

export interface DownloadItem {
    id: string;
    mediaId: string;
    itemType: 'movie' | 'episode';
    title: string;
    subtitle?: string;
    posterUrl?: string;
    localPath: string;
    fileSize: number;
    duration?: number;
    seriesId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    mediaSnapshot: DownloadMediaSnapshot;
    downloadedAt: number;
    galleryAssetId?: string;
}

export interface DownloadTask {
    id: string;
    mediaId: string;
    itemType: 'movie' | 'episode';
    title: string;
    subtitle?: string;
    posterUrl?: string;
    seriesId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    mediaSnapshot: DownloadMediaSnapshot;
    status: DownloadStatus;
    progress: number;
    bytesDownloaded: number;
    bytesTotal: number;
    remoteUrl: string;
    destPath: string;
    resumableSnapshot?: string;
    error?: string;
    retries: number;
    createdAt: number;
    speedBps?: number;
    eta?: number;
}

// ===== STREMIO ADDON & DEBRID TYPES =====

export type AddonContentType = 'movie' | 'series' | 'channel' | 'tv' | string;

export interface AddonResourceObj {
    name: string;
    types?: string[];
    idPrefixes?: string[];
}

export type AddonResource = string | AddonResourceObj;

export interface AddonCatalogExtra {
    name: string;
    isRequired?: boolean;
    options?: string[];
    optionsLimit?: number;
}

export interface AddonCatalogDef {
    type: string;
    id: string;
    name?: string;
    extra?: AddonCatalogExtra[];
    extraSupported?: string[];
    extraRequired?: string[];
}

export interface AddonBehaviorHints {
    adult?: boolean;
    p2p?: boolean;
    configurable?: boolean;
    configurationRequired?: boolean;
}

export interface AddonManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    logo?: string;
    background?: string;
    types: string[];
    resources: AddonResource[];
    catalogs: AddonCatalogDef[];
    idPrefixes?: string[];
    behaviorHints?: AddonBehaviorHints;
}

export interface InstalledAddon {
    id: string;
    name: string;
    version: string;
    description?: string;
    logo?: string;
    /** URL normalizada do manifesto (/manifest.json + ?query preservada) */
    transportUrl: string;
    /** Alias compatível com Saimo Connect (mesmo valor de transportUrl) */
    url: string;
    /** Base da URL sem /manifest.json (com ?query separada internamente) */
    baseUrl: string;
    enabled: boolean;
    order: number;
    manifest: AddonManifest;
    addedAt: number;
    hydrated?: boolean;
}

export interface AddonSubtitle {
    id?: string;
    url: string;
    lang: string;
    label?: string;
    addonId?: string;
    addonName?: string;
}

export interface AddonStreamBehaviorHints {
    notWebReady?: boolean;
    bingeGroup?: string;
    countryWhitelist?: string[];
    proxyHeaders?: {
        request?: Record<string, string>;
        response?: Record<string, string>;
    };
    filename?: string;
    videoSize?: number;
    videoHash?: string;
}

export interface AddonStream {
    url?: string;
    ytId?: string;
    infoHash?: string;
    fileIdx?: number;
    externalUrl?: string;
    name?: string;
    title?: string;
    description?: string;
    subtitles?: AddonSubtitle[];
    sources?: string[];
    behaviorHints?: AddonStreamBehaviorHints;
    addonId?: string;
    addonName?: string;
}

export type AddonStreamKind = 'direct' | 'torrent' | 'external' | 'youtube' | 'invalid';

export interface AddonStreamResolved {
    addonId: string;
    addonName: string;
    kind: AddonStreamKind;
    stream: AddonStream;
    url?: string;
    externalUrl?: string;
    ytId?: string;
    infoHash?: string;
    fileIdx?: number;
    sources?: string[];
    headers?: Record<string, string>;
    bingeGroup?: string;
    subtitles: AddonSubtitle[];
    title: string;
    subtitle?: string;
    notWebReady?: boolean;
    filename?: string;
    videoSize?: number;
    videoHash?: string;
}

export interface AddonMetaVideo {
    id: string;
    title?: string;
    name?: string;
    season?: number;
    episode?: number;
    released?: string;
    overview?: string;
    thumbnail?: string;
    streams?: AddonStream[];
}

export interface AddonMeta {
    id: string;
    type: string;
    name: string;
    poster?: string;
    background?: string;
    logo?: string;
    description?: string;
    releaseInfo?: string;
    imdbRating?: string | number;
    genres?: string[];
    runtime?: string;
    cast?: string[];
    director?: string[];
    writer?: string[];
    country?: string;
    language?: string;
    imdb_id?: string;
    tmdb_id?: number | string;
    videos?: AddonMetaVideo[];
}

export type DebridProviderId = 'torbox' | 'realdebrid' | 'alldebrid' | 'premiumize';

export interface DebridProviderConfig {
    apiKey: string;
    enabled: boolean;
}

export interface DebridConfig {
    providers: Record<DebridProviderId, DebridProviderConfig>;
    sincronizarConnect: boolean;
}

export interface AddonSyncEntry {
    url: string;
    transportUrl: string;
    enabled: boolean;
    order: number;
    id: string;
    name: string;
}
