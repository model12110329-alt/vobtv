# VoB TV 사이트

바른 시선, 당당한 목소리. 방송 화면이 메인에 크게 보이는 VoB TV 언론사 사이트입니다.

- `index.html` 첫 화면 (배너, 속보, 방송 화면, 광고 4칸, AI 브리핑, 편성표, 숏츠, 유튜브 최신 영상, 기사)
- `article.html` 기사 상세
- `admin.html` 관리자 화면 (메뉴에 없는 숨은 주소)
- `api/youtube.js` 유튜브 채널 최신 영상을 가져오는 서버 함수
- `supabase/schema.sql` 데이터베이스 설정

## 처음 한 번만 하는 설정

### 1. Supabase (데이터 저장소, 무료로 시작)

1. https://supabase.com 에 가입하고 **New project** 를 만듭니다. 지역은 `Northeast Asia (Seoul)` 를 고르세요.
2. 왼쪽 메뉴 **SQL Editor** 를 열고 `supabase/schema.sql` 내용을 통째로 붙여넣습니다.
3. 맨 아래 줄의 `관리자이메일@example.com` 을 실제 관리자 이메일로 바꾸고 **Run** 을 누릅니다.
4. **Authentication > Users > Add user** 에서 같은 이메일과 비밀번호로 관리자 계정을 만듭니다. (**Auto Confirm User** 를 켜 주세요.)
5. **Project Settings > API** 에서 `Project URL` 과 `anon public` 키를 복사해 `js/config.js` 에 붙여넣습니다.

### 2. Vercel (사이트 주소, 무료로 시작)

1. https://vercel.com 에 GitHub 계정으로 가입합니다.
2. **Add New > Project** 에서 이 저장소를 고르고 **Deploy** 를 누릅니다. 설정은 바꿀 필요가 없습니다.
3. 몇십 초 뒤 `https://프로젝트이름.vercel.app` 주소가 생깁니다. 원하면 **Settings > Domains** 에서 `vobtv.kr` 같은 도메인을 연결합니다.

## 매일 쓰는 법

- 관리자 화면: `https://내사이트주소/admin.html` 에서 로그인합니다.
- **방송 편성**: 유튜브 영상·라이브 주소, 라이브 스트림(.m3u8) 주소를 넣거나 영상 파일을 올립니다. `첫 화면에서 바로 재생` 을 켠 방송이 메인에 나옵니다.
  - 유튜브 채널 라이브를 메인에 걸려면 주소에 `https://www.youtube.com/@VoBTV1/live` 를 넣고 `라이브 방송` 을 켜세요.
- **기사**: 제목, 요약, 본문, 대표 이미지를 넣으면 첫 화면 '주요 뉴스'와 기사 페이지에 나옵니다.
- **숏츠**: 유튜브 숏츠 주소를 넣으면 썸네일이 자동으로 붙습니다.
- **광고**: 칸 번호(1~4)를 고르고 300×125 이미지와 연결할 주소를 넣습니다.
- **속보**, **AI 브리핑**: 문구를 고치면 바로 반영됩니다.
- 유튜브 최신 영상은 `js/config.js` 의 `youtubeChannel` 채널에서 10분마다 자동으로 가져옵니다.

## 알아둘 점

- 영상 파일 직접 업로드는 Supabase 무료 요금제에서 파일당 50MB, 전체 1GB까지입니다. 긴 방송은 유튜브에 올리고 주소만 등록하는 것을 권합니다.
- `anon public` 키는 공개되어도 괜찮습니다. 글쓰기 권한은 데이터베이스 규칙으로 `admins` 에 등록된 이메일만 갖습니다. `service_role` 키는 절대 이 저장소에 넣지 마세요.
