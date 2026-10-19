import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { demoProfile, demoTrackDetails, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier, ReportReason } from '@/types/models';

export type FeedFilter = 'all' | 'friends' | 'records' | 'certified';
export type ReactionKind = 'like' | 'fire' | 'clap' | 'rage';

export type FeedPost = {
  id: string;
  author_id: string;
  author_username: string;
  author_avatar: string | null;
  author_elo: number;
  author_rank: RankTier;
  track_id: string | null;
  track_name: string | null;
  caption: string | null;
  lap_ms: number | null;
  kart_category: string | null;
  conditions: 'dry' | 'wet' | null;
  weight_class: string | null;
  media_path: string | null;
  media_type: 'image' | 'video' | null;
  media_width: number | null;
  media_height: number | null;
  certified: boolean;
  is_record: boolean;
  created_at: string;
  comments: number;
  reactions: Partial<Record<ReactionKind, number>>;
  my_reactions: ReactionKind[];
};

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { username: string; avatar_url: string | null } | null;
};

export type NewPost = {
  caption: string;
  trackId: string | null;
  lapMs: number | null;
  kartCategory: string;
  conditions: 'dry' | 'wet' | null;
  weightClass: string;
  sessionId: string | null;
  media: { uri: string; type: 'image' | 'video'; width: number; height: number } | null;
};

export const REACTIONS: { kind: Exclude<ReactionKind, 'like'>; emoji: string; label: string }[] = [
  { kind: 'fire', emoji: '🔥', label: 'En feu' },
  { kind: 'clap', emoji: '👏', label: 'Bravo' },
  { kind: 'rage', emoji: '😤', label: 'Rageant' },
];

const BUCKET = 'feed-media';
const PAGE = 15;
export const mediaUrl = (p: Pick<FeedPost, 'media_path'>) =>
  !p.media_path ? null : /^(file|blob|data|https?):/.test(p.media_path) ? p.media_path : supabase.storage.from(BUCKET).getPublicUrl(p.media_path).data.publicUrl;

// ---------- Mode démo ----------
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const track = (id: string) => demoTrackDetails.find((t) => t.id === id)?.name ?? null;
const demoPosts: FeedPost[] = [
  {
    id: 'fp-1', author_id: 'p3', author_username: 'ApexHunter', author_avatar: null, author_elo: 1467, author_rank: 'or',
    track_id: 't1', track_name: track('t1'), caption: 'Nouveau record sur SpeedPark ! Le pont se passe à fond maintenant 😎',
    lap_ms: 24812, kart_category: '270cc', conditions: 'dry', weight_class: '70-75 kg', media_path: null, media_type: null,
    media_width: null, media_height: null, certified: true, is_record: true, created_at: hoursAgo(1), comments: 2,
    reactions: { like: 12, fire: 7, clap: 3 }, my_reactions: ['fire'],
  },
  {
    id: 'fp-2', author_id: 'p1', author_username: 'TurboLéa', author_avatar: null, author_elo: 1342, author_rank: 'argent',
    track_id: 't3', track_name: track('t3'), caption: 'Qualif de l’endurance de samedi, 2e sur la grille. On remet ça la semaine prochaine !',
    lap_ms: 38905, kart_category: '270cc', conditions: 'wet', weight_class: '55-60 kg', media_path: null, media_type: null,
    media_width: null, media_height: null, certified: false, is_record: false, created_at: hoursAgo(5), comments: 0,
    reactions: { like: 4, clap: 2 }, my_reactions: [],
  },
  {
    id: 'fp-3', author_id: 'p2', author_username: 'Drift_Max', author_avatar: null, author_elo: 1198, author_rank: 'bronze',
    track_id: 't2', track_name: track('t2'), caption: 'Le Virage en aveugle m’a encore eu… 3 tête-à-queue en une session 😤',
    lap_ms: null, kart_category: null, conditions: null, weight_class: null, media_path: null, media_type: null,
    media_width: null, media_height: null, certified: false, is_record: false, created_at: hoursAgo(26), comments: 1,
    reactions: { like: 3, rage: 5 }, my_reactions: ['like'],
  },
];
const demoComments: PostComment[] = [
  { id: 'pc-1', post_id: 'fp-1', author_id: 'p1', body: 'Monstrueux 🔥 tu me donnes tes trajectoires ?', created_at: hoursAgo(0.8), author: { username: 'TurboLéa', avatar_url: null } },
  { id: 'pc-2', post_id: 'fp-1', author_id: 'p2', body: 'Revanche samedi, prépare-toi.', created_at: hoursAgo(0.5), author: { username: 'Drift_Max', avatar_url: null } },
  { id: 'pc-3', post_id: 'fp-3', author_id: 'p3', body: 'Freine plus tôt et vise le vibreur intérieur 😉', created_at: hoursAgo(20), author: { username: 'ApexHunter', avatar_url: null } },
];
let demoSeq = 0;

function demoFeed(filter: FeedFilter): FeedPost[] {
  const friends = new Set(['p1', 'p3', demoProfile.id]);
  return demoPosts
    .filter((p) =>
      filter === 'friends' ? friends.has(p.author_id) : filter === 'records' ? p.is_record : filter === 'certified' ? p.certified : true,
    )
    .map((p) => ({ ...p, reactions: { ...p.reactions }, my_reactions: [...p.my_reactions] }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------- Fil ----------
const feedKey = (filter: FeedFilter) => ['feed', filter] as const;

export function useFeed(filter: FeedFilter) {
  return useInfiniteQuery({
    queryKey: feedKey(filter),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedPost[]> => {
      if (isDemoMode) return pageParam ? [] : demoFeed(filter);
      const { data, error } = await supabase.rpc('feed', { p_filter: filter, p_before: pageParam, p_limit: PAGE });
      if (error) throw error;
      return data as FeedPost[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
  });
}

export function usePost(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['feed', 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<FeedPost | null> => {
      if (isDemoMode) return demoFeed('all').find((p) => p.id === id) ?? null;
      // Le fil déjà chargé contient en général la publication ; sinon on parcourt les dernières.
      for (const [, data] of queryClient.getQueriesData<InfiniteData<FeedPost[]>>({ queryKey: ['feed'] })) {
        const found = data?.pages?.flat().find((p) => p.id === id);
        if (found) return found;
      }
      const { data, error } = await supabase.rpc('feed', { p_filter: 'all', p_before: null, p_limit: 50 });
      if (error) throw error;
      return (data as FeedPost[]).find((p) => p.id === id) ?? null;
    },
  });
}

// ---------- Publier ----------
async function uploadMedia(userId: string, media: NonNullable<NewPost['media']>) {
  let uri = media.uri;
  let { width, height } = media;
  let contentType = 'video/mp4';
  let ext = 'mp4';
  if (media.type === 'image') {
    const context = ImageManipulator.manipulate(uri);
    if (width > 1600) context.resize({ width: 1600 });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    uri = saved.uri;
    width = saved.width;
    height = saved.height;
    contentType = 'image/jpeg';
    ext = 'jpg';
  } else if (/\.mov$/i.test(uri)) {
    contentType = 'video/quicktime';
    ext = 'mov';
  }
  if (isDemoMode) return { path: uri, width, height };
  const bytes = await (await fetch(uri)).arrayBuffer();
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('Vidéo trop lourde (50 Mo max) : raccourcis-la.');
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) throw error;
  return { path, width, height };
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async (input: NewPost): Promise<string> => {
      const media = input.media ? await uploadMedia(userId ?? demoProfile.id, input.media) : null;
      if (isDemoMode) {
        const id = `fp-new-${++demoSeq}`;
        demoPosts.push({
          id, author_id: demoProfile.id, author_username: demoProfile.username, author_avatar: demoProfile.avatar_url,
          author_elo: demoProfile.elo, author_rank: demoProfile.rank, track_id: input.trackId, track_name: input.trackId ? track(input.trackId) : null,
          caption: input.caption.trim() || null, lap_ms: input.lapMs, kart_category: input.kartCategory.trim() || null,
          conditions: input.conditions, weight_class: input.weightClass.trim() || null, media_path: media?.path ?? null,
          media_type: input.media?.type ?? null, media_width: media?.width ?? null, media_height: media?.height ?? null,
          certified: !!input.sessionId, is_record: false, created_at: new Date().toISOString(), comments: 0, reactions: {}, my_reactions: [],
        });
        return id;
      }
      const { data, error } = await supabase.rpc('create_post', {
        p: {
          caption: input.caption,
          track_id: input.trackId ?? '',
          lap_ms: input.lapMs ?? '',
          kart_category: input.kartCategory,
          conditions: input.conditions ?? '',
          weight_class: input.weightClass,
          session_id: input.sessionId ?? '',
          media_path: media?.path ?? '',
          media_type: input.media?.type ?? '',
          media_width: media?.width ?? '',
          media_height: media?.height ?? '',
        },
      });
      if (error) {
        if (media) await supabase.storage.from(BUCKET).remove([media.path]);
        throw socialError(error);
      }
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: FeedPost) => {
      if (isDemoMode) {
        const i = demoPosts.findIndex((p) => p.id === post.id);
        if (i >= 0) demoPosts.splice(i, 1);
        return;
      }
      const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
      if (error) throw socialError(error);
      if (post.media_path) await supabase.storage.from(BUCKET).remove([post.media_path]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
}

// ---------- Réactions (mise à jour immédiate de l'écran) ----------
function applyReaction(p: FeedPost, kind: ReactionKind): FeedPost {
  const had = p.my_reactions.includes(kind);
  const count = (p.reactions[kind] ?? 0) + (had ? -1 : 1);
  return {
    ...p,
    reactions: { ...p.reactions, [kind]: Math.max(0, count) },
    my_reactions: had ? p.my_reactions.filter((k) => k !== kind) : [...p.my_reactions, kind],
  };
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ post, kind }: { post: FeedPost; kind: ReactionKind }) => {
      if (isDemoMode) {
        const p = demoPosts.find((x) => x.id === post.id);
        if (p) Object.assign(p, applyReaction(p, kind));
        return;
      }
      const { error } = await supabase.rpc('toggle_reaction', { p_post_id: post.id, p_kind: kind });
      if (error) throw socialError(error);
    },
    onMutate: ({ post, kind }) => {
      queryClient.setQueriesData<InfiniteData<FeedPost[]>>({ queryKey: ['feed'] }, (data) =>
        data?.pages
          ? { ...data, pages: data.pages.map((page) => page.map((p) => (p.id === post.id ? applyReaction(p, kind) : p))) }
          : data,
      );
      queryClient.setQueryData<FeedPost | null>(['feed', 'one', post.id], (p) => (p ? applyReaction(p, kind) : p));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
}

// ---------- Commentaires ----------
export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['post-comments', postId],
    enabled: !!postId,
    queryFn: async (): Promise<PostComment[]> => {
      if (isDemoMode) return demoComments.filter((c) => c.post_id === postId);
      const { data, error } = await supabase
        .from('post_comments')
        .select('id, post_id, author_id, body, created_at, author:profiles!post_comments_author_id_fkey (username, avatar_url)')
        .eq('post_id', postId!)
        .order('created_at')
        .limit(200);
      if (error) throw error;
      return data as unknown as PostComment[];
    },
  });
}

export function useAddComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (isDemoMode) {
        demoComments.push({
          id: `pc-${Date.now()}`, post_id: postId, author_id: demoProfile.id, body: body.trim(), created_at: new Date().toISOString(),
          author: { username: demoProfile.username, avatar_url: demoProfile.avatar_url },
        });
        const p = demoPosts.find((x) => x.id === postId);
        if (p) p.comments += 1;
        return;
      }
      const { error } = await supabase.rpc('add_comment', { p_post_id: postId, p_body: body.trim() });
      if (error) throw socialError(error);
    },
    onSuccess: () => ['post-comments', 'feed'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  });
}

export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      if (isDemoMode) {
        const i = demoComments.findIndex((c) => c.id === commentId);
        if (i >= 0) demoComments.splice(i, 1);
        const p = demoPosts.find((x) => x.id === postId);
        if (p) p.comments = Math.max(0, p.comments - 1);
        return;
      }
      const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
      if (error) throw socialError(error);
    },
    onSuccess: () => ['post-comments', 'feed'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  });
}

/** Signale une publication ou un commentaire ; masqué pour tous après 3 signalements. */
export function useReportPost() {
  return useMutation({
    mutationFn: async ({ postId, commentId, reason, details }: { postId: string; commentId?: string; reason: ReportReason; details?: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('report_post', {
        p_post_id: postId,
        p_reason: reason,
        p_details: details?.trim() || null,
        p_comment_id: commentId ?? null,
      });
      if (error) throw socialError(error);
    },
  });
}

// ---------- Mes Time Attack validés (pour publier un chrono certifié) ----------
export type ShareableSession = { id: string; track_id: string; track_name: string | null; best_lap_ms: number; validated_at: string | null };

export function useShareableSessions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['shareable-sessions', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ShareableSession[]> => {
      if (isDemoMode) {
        return [{ id: 'ta-demo', track_id: 't1', track_name: track('t1'), best_lap_ms: 25134, validated_at: hoursAgo(30) }];
      }
      const { data, error } = await supabase
        .from('time_attack_sessions')
        .select('id, track_id, best_lap_ms, validated_at, track:tracks (name)')
        .eq('pilot_id', userId!)
        .eq('status', 'validated')
        .order('validated_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as unknown as (Omit<ShareableSession, 'track_name'> & { track: { name: string } | null })[]).map(({ track: t, ...s }) => ({
        ...s,
        track_name: t?.name ?? null,
      }));
    },
  });
}
