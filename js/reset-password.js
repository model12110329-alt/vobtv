(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const config=window.VOB_CONFIG||{};
  const hash=new URLSearchParams(location.hash.slice(1));
  const query=new URLSearchParams(location.search);
  const recoveryLink=hash.get('type')==='recovery';
  const linkError=hash.has('error')||query.has('error');
  let recoveryReady=false, busy=false;
  function message(text,bad=false){el('resetMessage').textContent=text;el('resetMessage').classList.toggle('error',bad);}
  function cleanURL(){history.replaceState(null,'',location.pathname);}
  function requestView(text=''){
    recoveryReady=false;
    el('checking').hidden=true;el('passwordSection').hidden=true;el('requestSection').hidden=false;
    if(text)message(text,true);
  }
  function passwordView(){
    recoveryReady=true;cleanURL();
    el('checking').hidden=true;el('requestSection').hidden=true;el('passwordSection').hidden=false;
    message('');el('newPassword').focus();
  }
  if(!config.supabaseUrl||!config.supabaseAnonKey||!window.supabase){
    el('checking').textContent='연결을 준비하지 못했습니다. 잠시 후 새로고침해 주세요.';return;
  }
  // Separate client, same project session key; never use a privileged server key here.
  const db=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
  db.auth.onAuthStateChange((event,session)=>{
    // Do not await another Auth call inside this synchronous callback.
    if(event==='PASSWORD_RECOVERY'&&session&&!linkError)passwordView();
  });
  async function initialize(){
    try{
      const {data,error}=await db.auth.getSession();
      if(linkError){cleanURL();requestView('복구 링크가 만료됐거나 이미 사용되었습니다. 새 메일을 받아주세요.');return;}
      if(recoveryReady)return;
      if(!error&&recoveryLink&&data?.session){passwordView();return;}
      cleanURL();requestView(recoveryLink?'복구 링크를 확인할 수 없습니다. 새 메일을 받아주세요.':'');
    }catch(_){cleanURL();requestView('연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  }
  el('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!el('requestForm').reportValidity())return;
    busy=true;el('sendReset').disabled=true;message('재설정 메일을 요청하고 있습니다…');
    try{
      const redirectTo=new URL('reset-password.html',location.href).href;
      const {error}=await db.auth.resetPasswordForEmail(el('resetEmail').value.trim(),{redirectTo});
      if(error){message(error.status===429?'요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.':'메일 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',true);}
      else message('등록된 계정이면 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요. 가장 최근 메일의 링크를 이용해 주세요.');
    }catch(_){message('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',true);}
    finally{busy=false;el('sendReset').disabled=false;}
  });
  el('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!el('passwordForm').reportValidity())return;
    if(!recoveryReady){requestView('복구 메일의 링크를 먼저 열어주세요.');return;}
    const password=el('newPassword').value;
    if(password!==el('confirmPassword').value){message('두 비밀번호가 일치하지 않습니다.',true);return;}
    busy=true;el('savePassword').disabled=true;message('새 비밀번호를 저장하고 있습니다…');
    try{
      const {error}=await db.auth.updateUser({password});
      if(error){message('비밀번호를 저장하지 못했습니다. 더 강한 새 비밀번호로 다시 시도하거나 새 복구 메일을 받아주세요.',true);return;}
      recoveryReady=false;el('passwordForm').reset();el('passwordSection').hidden=true;
      // Password change has succeeded even if sign-out fails. Do not ask to repeat it.
      try{await db.auth.signOut({scope:'local'});}catch(_){}
      message('비밀번호를 변경했습니다. 관리자 로그인으로 돌아가 새 비밀번호로 로그인해 주세요.');
    }catch(_){message('연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.',true);}
    finally{busy=false;el('savePassword').disabled=false;}
  });
  initialize();
})();
