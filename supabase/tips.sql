-- VoB TV 기사제보 비공개 접수 테이블/첨부 저장소 (기존 데이터 삭제 없음)
-- 기존 Supabase 프로젝트의 SQL Editor에서 한 번 실행하세요.
create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  email text not null check (char_length(trim(email)) between 5 and 254 and position('@' in email)>1),
  content text not null check (char_length(trim(content)) between 20 and 10000),
  attachments text[] not null default '{}'
    check (cardinality(attachments)<=3),
  status text not null default 'new'
    check (status in ('new','reviewing','closed')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.tips enable row level security;
drop policy if exists "기사제보 누구나 접수" on public.tips;
create policy "기사제보 누구나 접수" on public.tips
 for insert to anon, authenticated
 with check (status='new' and cardinality(attachments)<=3);
drop policy if exists "기사제보 관리자 조회" on public.tips;
create policy "기사제보 관리자 조회" on public.tips
 for select to authenticated using (public.is_admin());
drop policy if exists "기사제보 관리자 수정" on public.tips;
create policy "기사제보 관리자 수정" on public.tips
 for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "기사제보 관리자 삭제" on public.tips;
create policy "기사제보 관리자 삭제" on public.tips
 for delete to authenticated using (public.is_admin());

-- 첨부자료는 공개하지 않는 전용 버킷에 보관합니다.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tip-attachments','tip-attachments',false,8388608,
 array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
 public=false,
 file_size_limit=8388608,
 allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "기사제보 첨부 업로드" on storage.objects;
create policy "기사제보 첨부 업로드" on storage.objects
 for insert to anon, authenticated
 with check (
   bucket_id='tip-attachments'
   and (storage.foldername(name))[1]='incoming'
   and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf')
 );
drop policy if exists "기사제보 첨부 관리자 조회" on storage.objects;
create policy "기사제보 첨부 관리자 조회" on storage.objects
 for select to authenticated
 using (bucket_id='tip-attachments' and public.is_admin());
drop policy if exists "기사제보 첨부 관리자 삭제" on storage.objects;
create policy "기사제보 첨부 관리자 삭제" on storage.objects
 for delete to authenticated
 using (bucket_id='tip-attachments' and public.is_admin());
