-- VoB TV 영상 관리: YouTube 자동 수집 영상의 홈페이지 숨기기 / 복원
-- Supabase 대시보드 → SQL Editor에서 한 번만 실행합니다.
-- 유튜브 원본은 삭제되지 않고 VoB TV 사이트 표시만 제어됩니다.

create table if not exists public.hidden_youtube_videos (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '',
  created_at timestamptz not null default now()
);

alter table public.hidden_youtube_videos enable row level security;

drop policy if exists "영상 숨김 공개 읽기" on public.hidden_youtube_videos;
create policy "영상 숨김 공개 읽기"
  on public.hidden_youtube_videos for select
  to anon, authenticated using (true);

drop policy if exists "영상 숨김 관리자 추가" on public.hidden_youtube_videos;
create policy "영상 숨김 관리자 추가"
  on public.hidden_youtube_videos for insert
  to authenticated with check (public.is_admin());

drop policy if exists "영상 숨김 관리자 수정" on public.hidden_youtube_videos;
create policy "영상 숨김 관리자 수정"
  on public.hidden_youtube_videos for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "영상 숨김 관리자 복원" on public.hidden_youtube_videos;
create policy "영상 숨김 관리자 복원"
  on public.hidden_youtube_videos for delete
  to authenticated using (public.is_admin());
