/* VoB TV 비공개 기사제보: 클라이언트에서 확인 후 Supabase로 안전하게 접수 */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const db=window.VOB?.db;
 const form=$("tipForm"), submit=$("tipSubmit"), message=$("tipMessage");
 const filesEl=$("tipFiles");
 const MAX_FILE=8*1024*1024, MAX_TOTAL=16*1024*1024;
 const allowed=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["application/pdf","pdf"]]);
 const num=()=>{
   const a=2+Math.floor(Math.random()*8), b=1+Math.floor(Math.random()*9);
   $("tipQuestion").textContent=a+" + "+b+" = ?";
   return a+b;
 };
 let answer=num();
 const setMessage=(str,error=false)=>{message.textContent=str;message.dataset.error=String(error)};
 const getFiles=()=>Array.from(filesEl.files||[]);
 function validateFiles(){
   const files=getFiles();
   if(files.length>3) return "첨부파일은 최대 3개까지 선택할 수 있습니다.";
   if(files.some(f=>!allowed.has(f.type)))return "JPG, PNG, WEBP 이미지 또는 PDF만 첨부할 수 있습니다.";
   if(files.some(f=>f.size>MAX_FILE))return "각 첨부파일은 8MB 이하여야 합니다.";
   if(files.reduce((a,f)=>a+f.size,0)>MAX_TOTAL)return "첨부파일 총합은 16MB 이하여야 합니다.";
   return "";
 }
 filesEl.addEventListener("change",()=>{
   const files=getFiles(), err=validateFiles();
   $("tipFileList").innerHTML="";
   for(const file of files){
     const li=document.createElement("li");
     li.textContent=file.name+" · "+(file.size/1024/1024).toFixed(1)+"MB";
     $("tipFileList").appendChild(li);
   }
   setMessage(err,!!err);
 });
 if(!db){submit.disabled=true;setMessage("현재 제보 접수 연결을 준비하고 있습니다. 잠시 후 다시 이용해 주세요.",true);}
 form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(!db){setMessage("현재 제보 접수 연결이 준비되지 않았습니다.",true);return}
   if($("tipWebsite").value.trim()){setMessage("제보가 접수되었습니다.");return}
   const name=$("tipName").value.trim(), email=$("tipEmail").value.trim(),content=$("tipContent").value.trim();
   if(!name || !form.querySelector("#tipEmail").validity.valid){setMessage("이름과 올바른 이메일 주소를 입력해 주세요.",true);return}
   if(content.length<20||content.length>10000){setMessage("제보 내용은 20자 이상 10,000자 이하로 작성해 주세요.",true);return}
   const err=validateFiles();if(err){setMessage(err,true);return}
   if(String($("tipCaptcha").value).trim()!==String(answer)){setMessage("스팸 확인 계산의 정답을 확인해 주세요.",true);answer=num();$("tipCaptcha").value="";return}
   if(!$("tipConsent").checked){setMessage("개인정보 수집·이용에 동의해 주세요.",true);return}
   submit.disabled=true;
   const paths=[];
   try{
     for(const [i,file] of getFiles().entries()){
       setMessage("첨부파일 업로드 중… ("+(i+1)+"/"+getFiles().length+")");
       const path="incoming/"+crypto.randomUUID()+"-"+(i+1)+"."+allowed.get(file.type);
       const {error}=await db.storage.from("tip-attachments").upload(path,file,{upsert:false,contentType:file.type});
       if(error)throw new Error("첨부파일을 업로드하지 못했습니다. 저장소 설정을 확인해 주세요.");
       paths.push(path);
     }
     setMessage("제보 내용을 안전하게 접수하는 중입니다…");
     const {error}=await db.from("tips").insert({name,email,content,attachments:paths});
     if(error)throw new Error("제보 접수에 실패했습니다. 관리자에게 문의하거나 잠시 후 다시 시도해 주세요.");
     form.reset();$("tipFileList").innerHTML="";answer=num();
     setMessage("제보가 정상 접수되었습니다. 소중한 제보 감사합니다.");
   }catch(e){
     if(paths.length)await db.storage.from("tip-attachments").remove(paths).catch(()=>{});
     setMessage(e.message||"접수 과정에서 오류가 발생했습니다. 다시 시도해 주세요.",true);
   }finally{submit.disabled=false}
 });
})();