(() => {
  const CLIENT_ID='46742451501-fc705j0o8ffabtpql28ufsqkfdq3js89.apps.googleusercontent.com';
  const FOLDER_ID='1ywyLMxaXOl_pWlto7wnLlYq0zG-0zeMv';
  const SHEET_ID='1g24Es02qizbBYJR5fZJ1RGBC0EujaD4fcwsp8bgIi4s';
  const SCOPES='https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';
  const $=id=>document.getElementById(id);
  const state={token:'',position:null,file:null,tokenClient:null,previewUrl:''};
  window.addEventListener('load',init);

  function init(){
    const now=new Date(); $('day').textContent=now.getDate(); $('month').textContent=`${now.getMonth()+1}月・${now.getFullYear()}`; $('date').textContent=now.toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric'});
    updateNetwork(); window.addEventListener('online',updateNetwork); window.addEventListener('offline',updateNetwork);
    $('camera').onclick=()=>$('cameraInput').click(); $('library').onclick=()=>$('libraryInput').click();
    $('cameraInput').onchange=e=>selectFile(e.target.files[0],e.target); $('libraryInput').onchange=e=>selectFile(e.target.files[0],e.target);
    $('locate').onclick=locate; $('login').onclick=login; $('refresh').onclick=loadRecords; $('cancel').onclick=closeDialog; $('photoForm').onsubmit=upload;
    waitForGoogle(); locate();
  }
  function waitForGoogle(){if(!window.google?.accounts?.oauth2)return setTimeout(waitForGoogle,200);state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:onToken});}
  function login(){if(!state.tokenClient)return notice('Google 登入程式仍在載入，請稍後再試',true);state.tokenClient.requestAccessToken({prompt:state.token?'':'consent'});}
  async function onToken(response){if(response.error)return notice(`登入失敗：${response.error}`,true);state.token=response.access_token;const me=await api('https://www.googleapis.com/oauth2/v3/userinfo');$('account').textContent=me.email||'Google 已登入';$('login').textContent='重新授權';notice('Google 登入成功');loadRecords();}
  function updateNetwork(){$('network').textContent=navigator.onLine?'● 網路正常':'○ 目前離線';}
  function locate(){
    $('locationStatus').textContent='正在取得手機座標…';
    if(!navigator.geolocation){$('locationStatus').textContent='此瀏覽器不支援定位';return;}
    navigator.geolocation.getCurrentPosition(p=>{state.position=p;$('locationStatus').textContent=`目前座標：${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}（精度約 ${Math.round(p.coords.accuracy)} 公尺）`;},e=>{$('locationStatus').textContent=`定位失敗：${e.code===1?'權限遭拒':e.code===2?'無法判定位置':'定位逾時'}`;},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  }
  function selectFile(file,input){input.value='';if(!file)return;if(!state.token){notice('請先按「Google 登入」',true);return;}state.file=file;if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.previewUrl=URL.createObjectURL(file);$('preview').src=state.previewUrl;$('description').value='';$('photoLocation').textContent=state.position?`將記錄：${state.position.coords.latitude.toFixed(6)}, ${state.position.coords.longitude.toFixed(6)}`:'尚未取得座標，請先按「重新定位」';$('photoDialog').showModal();}
  function closeDialog(){if($('photoDialog').open)$('photoDialog').close();state.file=null;}
  async function upload(event){event.preventDefault();if(!state.file)return;const description=$('description').value.trim();if(!description)return;const button=$('save');button.disabled=true;button.textContent='上傳中…';try{const blob=await compress(state.file);const fileName=`survey-${Date.now()}.jpg`;const file=await uploadDrive(blob,fileName);const now=new Date().toISOString();const lat=state.position?.coords.latitude??'';const lng=state.position?.coords.longitude??'';await api(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:[[crypto.randomUUID(),now,file.id,fileName,description,lat,lng,state.position?'DEVICE':'NONE',$('account').textContent,`https://drive.google.com/open?id=${file.id}`,now]]})});closeDialog();notice('照片、說明與座標已上傳');loadRecords();}catch(e){notice(`上傳失敗：${e.message}`,true);}finally{button.disabled=false;button.textContent='保存並上傳';}}
  async function uploadDrive(blob,name){const meta={name,parents:[FOLDER_ID],description:$('description').value.trim()};const boundary='survey_boundary';const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,blob,`\r\n--${boundary}--`]);return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});}
  async function loadRecords(){if(!state.token)return;try{const data=await api(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A2:K`);const rows=(data.values||[]).slice(-30).reverse();const list=$('recordList');list.replaceChildren();if(!rows.length){list.innerHTML='<p class="empty">尚無現勘紀錄</p>';return;}rows.forEach(r=>{const a=document.createElement('a');a.className='record';a.href=r[9]||'#';a.target='_blank';a.innerHTML=`<b>${escapeHtml(r[4]||r[3]||'現勘照片')}</b><small>${escapeHtml(r[1]||'')}</small><small>${r[5]&&r[6]?`${r[5]}, ${r[6]}`:'無座標'}</small>`;list.append(a);});}catch(e){notice(`讀取紀錄失敗：${e.message}`,true);}}
  async function api(url,options={}){const headers={Authorization:`Bearer ${state.token}`,...(options.headers||{})};const response=await fetch(url,{...options,headers});if(response.status===401){state.token='';throw new Error('Google 登入已過期，請重新登入');}const data=await response.json();if(!response.ok)throw new Error(data.error?.message||`HTTP ${response.status}`);return data;}
  async function compress(file){const image=typeof createImageBitmap==='function'?await createImageBitmap(file):await loadImage(file);const ratio=Math.min(1,2200/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close?.();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('照片壓縮失敗')),'image/jpeg',.84));}
  function loadImage(file){return new Promise((resolve,reject)=>{const image=new Image();const url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('手機無法讀取照片'));};image.src=url;});}
  function notice(text,error=false){$('notice').hidden=false;$('notice').textContent=text;$('notice').className=error?'error':'';}
  function escapeHtml(value){const div=document.createElement('div');div.textContent=value;return div.innerHTML;}
})();
