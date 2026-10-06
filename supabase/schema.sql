-- VoB TV 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 이 파일 내용을 통째로 붙여넣고 Run 을 누르세요.
-- 맨 아래 'admins' 에 들어가는 이메일을 관리자 이메일로 바꾼 뒤 실행하세요.

-- 관리자 목록 (여기 있는 이메일로 로그인한 사람만 글을 쓰고 고칠 수 있습니다)
create table if not exists admins (
  email text primary key
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- 편성표 (방송)
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'youtube' check (type in ('youtube','hls','file','demo')),
  url text,
  is_live boolean not null default false,
  is_main boolean not null default false,   -- 첫 화면에서 바로 재생할 방송
  time_label text,                           -- 예: 12:00, 지금
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- 기사
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  section text not null default '사회',
  title text not null,
  summary text,
  body text,
  image_url text,
  link_url text,                             -- 외부 기사로 바로 연결할 때만
  published_at timestamptz not null default now()
);

-- 숏츠
create table if not exists shorts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,                                  -- 유튜브 숏츠 주소
  sort int not null default 0
);

-- 광고 4칸
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  slot int not null check (slot between 1 and 4),
  image_url text,
  link_url text,
  alt text,
  active boolean not null default true
);

-- 속보 자막
create table if not exists ticker (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  sort int not null default 0,
  active boolean not null default true
);

-- AI 브리핑 (한 줄짜리 설정 표)
create table if not exists briefing (
  id int primary key default 1 check (id = 1),
  lines text[] not null default '{}',
  captions text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into briefing (id) values (1) on conflict (id) do nothing;

-- ARI 프로젝트 (소설·영상)
create table if not exists ari_works (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'novel' check (kind in ('novel','video')),
  title text not null,
  series text,
  episode int,
  summary text,
  body text,
  cover_url text,
  video_url text,
  published_at timestamptz not null default now()
);

-- 보안 규칙: 누구나 읽기, 관리자만 쓰기
do $$
declare t text;
begin
  foreach t in array array['programs','news','shorts','ads','ticker','briefing','ari_works'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "누구나 읽기" on %I', t);
    execute format('create policy "누구나 읽기" on %I for select using (true)', t);
    execute format('drop policy if exists "관리자 쓰기" on %I', t);
    execute format('create policy "관리자 쓰기" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
alter table admins enable row level security;
drop policy if exists "관리자만 보기" on admins;
create policy "관리자만 보기" on admins for select using (is_admin());

-- 이미지·영상 저장소 (공개 읽기, 관리자만 올리기)
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;
drop policy if exists "media 누구나 읽기" on storage.objects;
create policy "media 누구나 읽기" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media 관리자 올리기" on storage.objects;
create policy "media 관리자 올리기" on storage.objects for insert with check (bucket_id = 'media' and is_admin());
drop policy if exists "media 관리자 고치기" on storage.objects;
create policy "media 관리자 고치기" on storage.objects for update using (bucket_id = 'media' and is_admin());
drop policy if exists "media 관리자 지우기" on storage.objects;
create policy "media 관리자 지우기" on storage.objects for delete using (bucket_id = 'media' and is_admin());

-- 첫 데이터 (원하면 관리자 화면에서 고치거나 지우세요)
insert into programs (title, description, type, is_live, is_main, time_label, sort)
select 'VoB TV 종합뉴스', '메인 방송 채널', 'demo', true, true, '지금', 0
where not exists (select 1 from programs);
insert into ticker (text, sort)
select x, n from unnest(array['VoB TV 메인 방송이 시작되었습니다','VoB TV 유튜브 채널 @VoBTV1에서도 방송을 볼 수 있습니다']) with ordinality as t(x, n)
where not exists (select 1 from ticker);

-- ▼ 관리자 이메일: 아래 주소를 실제로 로그인할 이메일로 바꾸세요
insert into admins (email) values ('관리자이메일@example.com') on conflict do nothing;
