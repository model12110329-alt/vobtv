-- ARI 프로젝트 코너 (소설·영상) 설정
-- Supabase 대시보드 > SQL Editor 에 이 파일 내용을 붙여넣고 Run 을 한 번 누르세요.
create table if not exists ari_works (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'novel' check (kind in ('novel','video')),
  title text not null,
  series text,                               -- 연재 제목 (같은 작품의 회차를 묶을 때)
  episode int,                               -- 회차
  summary text,
  body text,                                 -- 소설 본문 (빈 줄로 문단 구분)
  cover_url text,
  video_url text,                            -- 유튜브 주소 (영상일 때)
  published_at timestamptz not null default now()
);
alter table ari_works enable row level security;
drop policy if exists "누구나 읽기" on ari_works;
create policy "누구나 읽기" on ari_works for select using (true);
drop policy if exists "관리자 쓰기" on ari_works;
create policy "관리자 쓰기" on ari_works for all using (is_admin()) with check (is_admin());
