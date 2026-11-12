import { clone, findDuplicate } from './store.js';
import { normalizePeople, parseFile, toCSV } from './importer.js';
import { esc, button as btn, field, input, select, options, toast, showModal, closeModal, empty, download } from './components.js';

export function createImportController({ seed, store, persist, refresh, getExpertId }) {
  let context = null;
  let selectedFiles = [];
  let busy = false;
  const countEntries = person => person.entries.filter(e => e.enabled !== false).length;
  const entriesToImport = () => context.people.filter(p => p.enabled && !p.ambiguous && p.matchedId).reduce((n,p)=>n+countEntries(p),0);
  const selections = () => store.state.experts.map(e=>[e.id,`${e.name} · ${e.department[0] || e.unit || e.id.slice(-6)}`]);
  const footerCancel = () => btn('取消','imp-cancel');
  const fileNames = () => context.fileNames.join('、');
  const errorBlock = () => '<div class="form-error" id="import-error" role="alert"></div>';
  function setError(message) { const el=document.getElementById('import-error');if(el){el.textContent=message;el.classList.add('visible');el.scrollIntoView({block:'nearest'});}else toast(message,'error'); }
  function persistDraft() {
    if(!context || !context.people?.length)return;
    const history=store.state.history.find(h=>h.id===context.historyId);
    const value={fileName:fileNames(),fileNames:context.fileNames,submittedAt:context.submittedAt || new Date().toLocaleString('zh-CN',{hour12:false}),status:'待确认',peopleCount:context.people.length,achievementCount:context.people.reduce((n,p)=>n+p.entries.length,0),batch:clone({people:context.people,fileNames:context.fileNames,fileName:fileNames(),mode:context.mode,expertId:context.expertId})};
    if(history)Object.assign(history,value);else{const id='history-'+crypto.randomUUID();context.historyId=id;store.state.history.unshift({id,...value});}
    persist();
  }
  function cancel() { if(context?.people?.length)persistDraft();closeModal();busy=false;context=null;selectedFiles=[]; }
  function openUpload(mode='batch', expertId=null) {
    context={mode,expertId,people:[],fileNames:[],historyId:null};selectedFiles=[];busy=false;renderUpload();
  }
  function renderUpload() {
    const single=context.mode==='single';const expert=store.getExpert(context.expertId);
    if(single)showModal({title:`导入成果 · ${expert?.name || ''}`,width:1060,onClose:cancel,body:`<div class="upload-stack">${errorBlock()}<div class="upload-meta"><p>${single?'为当前专家导入成果，完成核对后写入对应栏目。':'上传多人成果文件，依次完成人员匹配和成果核对。'}</p><span class="muted small-text">上次导入：${store.state.history[0]?.submittedAt || '暂无导入记录'}</span></div><div class="notice"><strong>${single?'个人成果导入':'批量成果导入'}</strong>推荐使用成果导入模板填写。上传后先进行人员匹配，再逐人核对成果内容。</div><div class="upload-templates">${btn('下载智库模板','imp-template')}${btn('下载年度考核表','imp-annual-template')}${btn('下载 JSON 示例','imp-json-template')}</div><div class="drop-zone" id="import-drop-zone"><h3>${selectedFiles.length?'已选择 '+selectedFiles.length+' 个文件':single?'上传个人成果文件':'上传多人成果文件'}</h3><p>支持模板 .csv、.json、.xlsx，可同时选择多个文件</p><div class="row wrap">${btn('选择文件','imp-pick-file','primary')}${btn('体验示例流程','imp-sample')}</div><input type="file" id="import-files" accept=".csv,.json,.xlsx,.doc,.docx,.xls" multiple hidden></div>${selectedFiles.length?`<div class="file-list">${selectedFiles.map((f,i)=>`<div class="file-item"><span>${esc(f.name)}</span><span class="muted small-text">${(f.size/1024).toFixed(1)} KB</span>${btn('移除','imp-remove-file','link danger',`data-index="${i}"`)}</div>`).join('')}</div>`:''}<p class="muted small-text">此交互预览在浏览器内解析模板文件。Word、旧版 XLS 与自由文本的智能识别需接入后台服务。</p></div>`,footer:footerCancel()+btn(selectedFiles.length?'解析并继续':'选择文件',selectedFiles.length?'imp-parse':'imp-pick-file','primary',busy?'disabled':'')});
    else showModal({title:'批量导入成果',width:1060,className:'batch-upload-modal',onClose:cancel,body:`<div class="upload-stack">
      ${errorBlock()}
      <div class="upload-meta"><p>上传多人成果文件，依次完成人员匹配和成果核对。</p><span class="muted small-text">上次导入：${esc(store.state.history[0]?.submittedAt || '暂无导入记录')}</span></div>
      <section class="notice upload-notice" aria-label="批量成果导入提示"><div class="upload-notice-head"><strong>批量成果导入</strong><div class="upload-templates">${btn('下载智库模版','imp-template')}${btn('下载年度考核表','imp-annual-template')}</div></div><p>推荐使用成果导入模板填写。上传后先进行人员匹配，再逐人核对成果内容。</p></section>
      <div class="drop-zone" id="import-drop-zone"><h3>${selectedFiles.length?'已选择 '+selectedFiles.length+' 个文件':'上传多人成果文件'}</h3><p>支持 .csv、.json、.xlsx，单次可上传多个文件</p>${btn('选择文件','imp-pick-file','primary')}<input type="file" id="import-files" accept=".csv,.json,.xlsx,.doc,.docx,.xls" multiple hidden></div>
      ${selectedFiles.length?`<div class="file-list">${selectedFiles.map((f,i)=>`<div class="file-item"><span>${esc(f.name)}</span><span class="muted small-text">${(f.size/1024).toFixed(1)} KB</span>${btn('移除','imp-remove-file','link danger',`data-index="${i}"`)}</div>`).join('')}</div>`:''}
    </div>`,footer:footerCancel()+btn(selectedFiles.length?'解析并继续':'选择文件',selectedFiles.length?'imp-parse':'imp-pick-file','primary',busy?'disabled':'')});
    const zone=document.getElementById('import-drop-zone');
    for(const name of ['dragenter','dragover'])zone.addEventListener(name,e=>{e.preventDefault();zone.classList.add('drag-over');});
    for(const name of ['dragleave','drop'])zone.addEventListener(name,e=>{e.preventDefault();zone.classList.remove('drag-over');});
    zone.addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));
  }
  function addFiles(files) {
    if(busy)return;
    const next=[...selectedFiles];
    for(const f of files){if(f.size>10*1024*1024){toast(`${f.name} 超过 10MB，未添加。`,'error');continue;}if(!next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))next.push(f);}
    if(next.length>10){toast('单次最多选择 10 个文件。','error');return;}
    selectedFiles=next;renderUpload();
  }
  function loadSample() {
    if(context.mode==='single') {
      const expert=store.getExpert(context.expertId);
      context.fileNames=[`${expert.name}_年度成果示例.json`];
      context.people=normalizePeople([{name:expert.name,entries:clone(seed.reviewSamples)}],seed,store.state.experts,expert.id);
      context.activePerson=0;persistDraft();renderReview();
    }else{
      const data=clone(seed.history.find(h=>h.batch?.people?.length)?.batch);
      context.people=normalizePeople(data.people,seed,store.state.experts);
      for(let i=0;i<context.people.length;i++){context.people[i].enabled=!context.people[i].ambiguous;}
      context.fileNames=['2026年教师成果汇总（示例）.json'];persistDraft();renderMatch();
    }
  }
  async function parseFiles() {
    if(busy||!selectedFiles.length)return;
    busy=true;document.querySelector('[data-action="imp-parse"]')?.setAttribute('disabled','');
    try{
      let people=[];
      for(const file of selectedFiles)people.push(...await parseFile(file,seed,store.state.experts,context.mode==='single'?context.expertId:null));
      if(context.mode==='single'){const entries=people.flatMap(p=>p.entries);people=[{name:store.getExpert(context.expertId).name,matchedId:context.expertId,entries,enabled:true,ambiguous:false}];}
      else{
        const names=new Map();for(const p of people)names.set(p.name,(names.get(p.name)||0)+1);
        people=people.map(p=>({...p,ambiguous:p.ambiguous||names.get(p.name)>1,enabled:!p.ambiguous&&names.get(p.name)===1}));
      }
      if(!people.some(p=>p.entries.length))throw new Error('文件中没有成果内容，请填写模板后重试。');
      context.people=people;context.fileNames=selectedFiles.map(f=>f.name);persistDraft();
      if(context.mode==='single'){context.activePerson=0;renderReview();}else renderMatch();
    }catch(error){setError(error.message || '文件解析失败，请检查模板格式。');}
    finally{busy=false;document.querySelector('[data-action="imp-parse"]')?.removeAttribute('disabled');}
  }
  function renderMatch() {
    if(!context)return;
    context.activePerson=null;
    showModal({title:'批量导入成果 · 人员匹配',width:680,onClose:cancel,body:`<div class="match-stack">${errorBlock()}<p class="secondary">文件：${esc(fileNames())}</p><div class="notice"><strong>人员匹配</strong>请勾选需要导入的人员。点击“查看并修改成果”逐人核对后，返回本列表。</div><div class="review-summary"><span class="secondary">解析出 ${context.people.length} 位人员</span><span class="purple-text" id="match-count">已选 ${context.people.filter(p=>p.enabled&&!p.ambiguous).length} 位专家</span></div>${context.people.some(p=>p.ambiguous)?'<p class="danger-text small-text">同名人员暂不支持批量导入，请至对应专家个人页面导入成果。</p>':''}${context.people.map((p,i)=>`<article class="person-card ${p.ambiguous?'disabled':!p.matchedId?'warning':''}"><div class="row wrap"><input type="checkbox" class="import-person-check" data-index="${i}" aria-label="选择导入${esc(p.name)}" ${p.enabled&&!p.ambiguous?'checked':''} ${p.ambiguous?'disabled':''}><input class="control person-name import-person-name" data-index="${i}" value="${esc(p.name)}" aria-label="第${i+1}位人员姓名" ${p.ambiguous?'disabled':''}><span class="muted small-text">${p.entries.length} 条成果</span><span class="tag ${p.ambiguous?'info':p.matchedId?'success':'warning'}">${p.ambiguous?'重名人员':p.matchedId?'已匹配':'需人工核对'}</span></div>${!p.ambiguous?field('匹配至专家',select('match-person',selections(),p.matchedId,'请选择已有专家',`data-match-index="${i}" aria-label="为${esc(p.name)}匹配专家"`)):''}<div class="person-actions">${btn('查看并修改成果','imp-review-person','primary',`data-index="${i}" ${p.ambiguous?'disabled':''}`)}</div><p class="small-text">${p.ambiguous?'该人员与其他结果重名，请至个人页面进行导入成果。':!p.matchedId?'选择已有专家后再导入，也可先进入成果核对。':'可修改人员名称、成果类别及字段，勾选需要导入的成果。'}</p></article>`).join('')}${btn('＋ 手动添加人员','imp-add-person','primary')}</div>`,footer:footerCancel()+btn('确认导入全部成果','imp-confirm','primary')});
  }
  function entryStatus(entry,person) {
    if(entry.enabled===false)return ['info','不导入'];
    if(person.matchedId&&findDuplicate(store.detail(person.matchedId),entry))return ['warning','重复成果'];
    if(!entry.fields[0]?.trim())return ['warning','缺少标题'];
    if(entry.needsReview&&!entry.reviewed)return ['warning','需核对'];
    return ['success','已核对'];
  }
  function reviewCard(entry,index,person) {
    const status=entryStatus(entry,person);
    return `<article class="review-card ${status[0]==='warning'?'warning':''} ${entry.enabled===false?'excluded':''}" data-entry-index="${index}"><div class="row"><input type="checkbox" class="entry-enabled" data-index="${index}" ${entry.enabled!==false?'checked':''} aria-label="导入第${index+1}条成果"><select class="control entry-type" data-index="${index}" aria-label="第${index+1}条成果类别">${options(seed.order.map(t=>[t,seed.names[t]]),entry.type)}</select><h3 class="grow">${esc(entry.fields[0] || '新成果')}</h3><span class="tag ${status[0]}">${status[1]}</span></div><div class="review-grid">${seed.schemas[entry.type].map((label,j)=>field(esc(label)+(j===0?'<span class="required">*</span>':''),input('entry-'+index+'-'+j,entry.fields[j],`data-entry="${index}" data-field="${j}" maxlength="2000" aria-label="第${index+1}条${esc(label)}" placeholder="请输入"`))).join('')}</div><div class="review-actions"><span class="muted small-text grow">${esc(entry.reviewReason || '核对字段后，可确认此成果。')}</span>${btn('删除','imp-delete-entry','link danger',`data-index="${index}"`)}${btn('确认核对','imp-mark-reviewed','',`data-index="${index}"`)}</div></article>`;
  }
  function renderReview() {
    const person=context.people[context.activePerson];
    showModal({title:`${context.mode==='single'?'个人成果导入':'批量导入成果'} · ${person.name}`,width:1060,onClose:cancel,body:`<div class="review-stack">${errorBlock()}<div class="notice"><strong>核对成果内容</strong>可修改成果类别及字段；取消勾选的成果不会导入。黄色卡片需要人工确认，重复成果会自动跳过。</div><div class="review-summary"><span class="secondary">${esc(person.name)} · 共 ${person.entries.length} 条成果</span><span class="purple-text" id="review-count">已选 ${countEntries(person)} 条</span></div>${!person.matchedId?`<div class="notice warning"><strong>请先匹配专家</strong>${select('review-match',selections(),person.matchedId,'请选择对应专家','id="review-match" aria-label="匹配当前人员至专家"')}</div>`:''}<div id="review-entries" class="review-stack">${person.entries.map((entry,i)=>reviewCard(entry,i,person)).join('') || empty('暂无成果，请手动添加')}</div>${btn('＋ 手动添加成果','imp-add-entry','primary')}</div>`,footer:context.mode==='single'?footerCancel()+btn('确认导入成果','imp-confirm','primary'):btn('返回人员匹配','imp-back-match')+btn('保存并返回人员匹配','imp-save-review','primary')});
  }
  function validateAll() {
    const people=context.people.filter(p=>p.enabled&&!p.ambiguous);
    if(!people.length)return '请至少选择一位需要导入的人员。';
    const ids=new Set();
    for(const person of people){
      if(!person.matchedId||!store.getExpert(person.matchedId))return `请先为「${person.name}」匹配已有专家。`;
      if(ids.has(person.matchedId))return '多位人员匹配到了同一专家，请检查人员匹配。';ids.add(person.matchedId);
      for(const entry of person.entries.filter(e=>e.enabled!==false)){
        if(!entry.fields[0]?.trim())return `「${person.name}」有成果缺少必填标题，请核对。`;
        if(entry.needsReview&&!entry.reviewed)return `「${person.name}」有成果尚未确认核对，请逐条确认或取消勾选。`;
      }
    }
    if(!entriesToImport())return '请至少勾选一条成果。';return '';
  }
  function finishImport() {
    const error=validateAll();if(error){setError(error);return;}
    let added=0,skipped=0,peopleCount=0;
    for(const person of context.people.filter(p=>p.enabled&&!p.ambiguous)){
      const result=store.importEntries(person.matchedId,person.entries);added+=result.added;skipped+=result.skipped;if(result.added)peopleCount++;
    }
    persistDraft();const item=store.state.history.find(h=>h.id===context.historyId);item.status='已导入';item.importedAt=new Date().toLocaleString('zh-CN',{hour12:false});item.result={added,skipped,peopleCount};persist();
    const single=context.mode==='single';const id=context.expertId;
    showModal({title:'导入完成',width:560,body:`<div class="success-panel"><div class="success-check" aria-hidden="true">✓</div><h3>${added?'成果导入成功':'核对完成'}</h3><p class="secondary">${single?'成果已保存至当前专家的对应栏目。':'选中专家的成果已保存至对应栏目。'}</p><div class="success-stats"><div><strong>${added}</strong><span>成功导入</span></div><div><strong>${skipped}</strong><span>重复跳过</span></div><div><strong>${peopleCount}</strong><span>更新专家</span></div></div><p class="muted small-text">${esc(fileNames())}</p></div>`,footer:btn('查看导入历史','imp-history')+btn(single?'查看专家成果':'完成','imp-done','primary',id?`data-id="${esc(id)}"`:'')});
    refresh();
  }
  function historyModal() {
    const rows=store.state.history.map(h=>{
      const statusClass=h.status==='已导入'?'success':h.status==='待确认'?'pending':'warning';
      const label=h.status==='已导入'?'查看详情':h.status==='识别中'?'查看进度':'查看结果';
      const action=h.status==='待确认'&&h.batch?.people?'imp-resume':'imp-history-result';
      return `<tr><td>${esc(h.fileName)}</td><td>${esc(h.submittedAt)}</td><td><span class="tag ${statusClass}">${esc(h.status)}</span></td><td>${h.peopleCount??'-'}</td><td>${h.achievementCount??'-'}</td><td>${btn(label,action,'link history-action',`data-id="${esc(h.id)}"`)}</td></tr>`;
    }).join('');
    showModal({title:'批量导入历史',width:1060,className:'import-history-modal',body:`<div class="history-list">
      <p class="secondary">大文件可在后台继续识别。识别完成后，可从此处进入人员匹配和成果核对。</p>
      <div class="data-table-scroll"><table class="data-table" aria-label="导入历史">
        <colgroup>${[390,190,100,90,90,152].map(width=>`<col style="width:${width}px">`).join('')}</colgroup>
        <thead><tr>${['文件名','提交时间','状态','识别人员','识别成果','操作'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`,footer:btn('关闭','close-modal','primary')});
  }
  function resume(id) {
    const h=store.state.history.find(x=>x.id===id);if(!h?.batch?.people)return;
    const data=clone(h.batch);context={mode:data.mode||'batch',expertId:data.expertId||null,historyId:h.id,fileNames:data.fileNames||[h.fileName],submittedAt:h.submittedAt,people:normalizePeople(data.people,seed,store.state.experts,data.mode==='single'?data.expertId:null)};
    context.people.forEach((p,i)=>{p.matchedId=data.people[i].matchedId||p.matchedId;p.enabled=data.people[i].enabled!==false&&!p.ambiguous;});
    if(context.mode==='single'){context.activePerson=0;renderReview();}else renderMatch();
  }
  function templateRows() {
    return [['姓名','成果类别','字段1','字段2','字段3','字段4','字段5','字段6','字段7','字段8'],...seed.samples.map(s=>[context?.expertId?store.getExpert(context.expertId).name:'南策文',seed.names[s.type],...s.fields])];
  }
  function downloadTemplate(json=false,annual=false,expertId=context?.expertId) {
    if(json){download('成果导入示例.json',JSON.stringify({people:[{name:expertId?store.getExpert(expertId).name:'南策文',entries:seed.samples}]},null,2),'application/json');return;}
    if(annual&&globalThis.ExcelJS){const book=new globalThis.ExcelJS.Workbook();const sheet=book.addWorksheet('年度成果');for(const row of templateRows())sheet.addRow(row);sheet.getRow(1).font={bold:true};sheet.columns.forEach((c,i)=>c.width=i===0?16:i===1?22:30);book.xlsx.writeBuffer().then(buffer=>download('年度成果考核模板.xlsx',buffer,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));return;}
    download('智库成果导入模板.csv',toCSV(templateRows()),'text/csv;charset=utf-8');
  }
  function savePersonReview() { persistDraft();renderMatch();toast('核对内容已保存'); }
  function addPerson() {context.people.push({name:'待匹配人员',matchedId:'',entries:[],enabled:true,ambiguous:false});persistDraft();renderMatch();document.querySelector('.modal-body').scrollTop=1e6;}
  function addEntry() { const p=context.people[context.activePerson];p.entries.push({type:'paper',fields:seed.schemas.paper.map(()=>''),enabled:true,needsReview:false,reviewed:false});renderReview();document.querySelector('.modal-body').scrollTop=1e6; }
  return {
    handleAction(action,target,event){
      switch(action){
        case 'batch-import':openUpload('batch');return true;
        case 'imp-batch-sample':openUpload('batch');loadSample();return true;
        case 'imp-batch-json-template':downloadTemplate(true,false,null);return true;
        case 'single-import':openUpload('single',getExpertId());return true;
        case 'history':case 'imp-history':historyModal();return true;
        case 'imp-cancel':cancel();return true;
        case 'imp-pick-file':document.getElementById('import-files')?.click();return true;
        case 'imp-remove-file':selectedFiles.splice(Number(target.dataset.index),1);renderUpload();return true;
        case 'imp-template':downloadTemplate();return true;
        case 'imp-annual-template':downloadTemplate(false,true);return true;
        case 'imp-json-template':downloadTemplate(true);return true;
        case 'imp-sample':loadSample();return true;
        case 'imp-parse':parseFiles();return true;
        case 'imp-review-person':context.activePerson=Number(target.dataset.index);renderReview();return true;
        case 'imp-back-match':case 'imp-save-review':savePersonReview();return true;
        case 'imp-add-person':addPerson();return true;
        case 'imp-add-entry':addEntry();return true;
        case 'imp-mark-reviewed':{const index=Number(target.dataset.index);const p=context.people[context.activePerson];const entry=p.entries[index];if(!entry.fields[0]?.trim()){setError('请先填写成果标题。');return true;}entry.reviewed=true;entry.needsReview=false;entry.reviewReason='已人工确认';persistDraft();const card=document.querySelector(`[data-entry-index="${index}"]`);card.outerHTML=reviewCard(entry,index,p);toast('该成果已确认核对');return true;}
        case 'imp-delete-entry':{const i=Number(target.dataset.index);showModal({title:'删除成果',width:440,body:`<p>确定从本次导入中移除「${esc(context.people[context.activePerson].entries[i].fields[0]||'未命名成果')}」？</p>`,footer:btn('取消','imp-keep-entry')+btn('删除','imp-delete-entry-confirm','danger-fill',`data-index="${i}"`)});return true;}
        case 'imp-keep-entry':renderReview();return true;
        case 'imp-delete-entry-confirm':context.people[context.activePerson].entries.splice(Number(target.dataset.index),1);persistDraft();renderReview();return true;
        case 'imp-confirm':finishImport();return true;
        case 'imp-done':{const id=target.dataset.id;closeModal();context=null;if(id){if(location.hash!==`#expert/${id}`)location.hash=`#expert/${id}`;else refresh();setTimeout(()=>document.getElementById('achievement-'+seed.order[0])?.scrollIntoView({behavior:'smooth'}),50);}return true;}
        case 'imp-resume':resume(target.dataset.id);return true;
        case 'imp-history-result':{const h=store.state.history.find(x=>x.id===target.dataset.id);showModal({title:'导入记录',width:560,body:`<div class="form-stack"><p>${esc(h.fileName)}</p><p class="secondary">状态：${esc(h.status)}　提交：${esc(h.submittedAt)}</p>${h.result?`<div class="notice"><strong>导入结果</strong>成功 ${h.result.added} 条，重复跳过 ${h.result.skipped} 条，更新 ${h.result.peopleCount} 位专家。</div>`:`<div class="notice"><strong>历史示例</strong>此条为原型中的历史状态样例，未包含可继续解析的文件内容。可从专家列表的“批量导入成果”体验完整流程。</div>`}</div>`,footer:btn('返回历史','imp-history')});return true;}
        default:return false;
      }
    },
    handleChange(target){
      if(target.id==='import-files'){addFiles([...target.files]);return true;}
      if(!context)return false;
      if(target.classList.contains('import-person-check')){context.people[Number(target.dataset.index)].enabled=target.checked;persistDraft();document.getElementById('match-count').textContent=`已选 ${context.people.filter(p=>p.enabled&&!p.ambiguous).length} 位专家`;return true;}
      if(target.classList.contains('import-person-name')){const p=context.people[Number(target.dataset.index)];p.name=target.value.trim();const matches=store.state.experts.filter(e=>e.name===p.name);p.matchedId=matches.length===1?matches[0].id:'';p.ambiguous=matches.length>1;persistDraft();renderMatch();return true;}
      if(target.hasAttribute('data-match-index')){context.people[Number(target.dataset.matchIndex)].matchedId=target.value;persistDraft();renderMatch();return true;}
      if(target.id==='review-match'){context.people[context.activePerson].matchedId=target.value;persistDraft();renderReview();return true;}
      if(target.classList.contains('entry-type')){const p=context.people[context.activePerson];const e=p.entries[Number(target.dataset.index)];e.type=target.value;e.fields=seed.schemas[e.type].map((_,i)=>e.fields[i]||'');e.reviewed=false;e.needsReview=true;e.reviewReason='类别已修改，请核对全部字段';persistDraft();renderReview();return true;}
      if(target.classList.contains('entry-enabled')){const p=context.people[context.activePerson];const entry=p.entries[Number(target.dataset.index)];entry.enabled=target.checked;persistDraft();const card=target.closest('.review-card');card.classList.toggle('excluded',!target.checked);const tag=card.querySelector('.tag');const status=entryStatus(entry,p);tag.className='tag '+status[0];tag.textContent=status[1];document.getElementById('review-count').textContent=`已选 ${countEntries(p)} 条`;return true;}
      if(target.hasAttribute('data-entry')){const p=context.people[context.activePerson];const e=p.entries[Number(target.dataset.entry)];e.fields[Number(target.dataset.field)]=target.value.trim();if(Number(target.dataset.field)===0)target.closest('.review-card').querySelector('h3').textContent=target.value.trim()||'新成果';persistDraft();return true;}
      return false;
    }
  };
}
