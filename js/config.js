// VoB TV 설정
// Supabase 프로젝트를 만든 뒤, Project Settings > API 화면의 두 값을 아래에 붙여넣으세요.
// 비워두면 사이트는 예시 데이터로 보입니다.
window.VOB_CONFIG = {
  supabaseUrl: "https://hirfliklqlqazqtcwiqr.supabase.co",
  supabaseAnonKey: "sb_publishable_yBuqvNJrWGSdgmBGbO8Olw_xB-Aqt-j", // Publishable 키 (공개되어도 괜찮은 키입니다)
  youtubeChannel: "@VoBTV1", // 최신 영상과 채널 라이브를 가져올 유튜브 채널
  // ARI 프로젝트 영상: 유튜브 재생목록 ID(PL…)를 넣으면 그 재생목록을 자동으로 보여줍니다.
  // 비워두면 채널 영상 중 제목에 아래 단어가 들어간 영상을 보여줍니다.
  ariPlaylist: "",
  ariKeyword: "ARI",
  // 선택사항: VoB 뉴스 전용 유튜브 재생목록 ID(PL...)를 등록하면 제목과 관계없이 자동 표시됩니다.
  // 비워두면 채널 영상 제목의 "VoB 뉴스", "VOB NEWS", 기존 "ARI 뉴스"를 찾아 표시합니다.
  newsPlaylist: ""
};
