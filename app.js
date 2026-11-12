import { createStore, filterExperts, clone, detailKeys } from './store.js';
import { esc, icon, button as btn, field, input, select, options, toast, closeModal, showModal, empty, download, safeLink, enhanceSelects } from './components.js';
import { createImportController } from './import-ui.js';

const root = document.getElementById('app');
let seed, store, imports;
const ui = { filters: {}, filterDraft: {}, expanded: false, selection: new Set(), page: 1, size: 50, sort: '', sortDirection: 1, collapsed: false, mobileOpen: false, account: false, groups: new Set(['知识库管理', '内容管理', '对话管理']) };
const ranks = ['院士', '文科资深教授', '正高级', '副高级', '中级'];
let avatarValue = '', draftExpertId = null;
let currentExpertId = null;
let confirmAction = null;
let editTextKey = '', editEntryType = '', editEntryIndex = -1;
const navAssets = { '概览': 'e00de', '知识库管理': 'b0fb6', '内容管理': '3ebb0', '专家管理': '333c4', '对话管理': '885f1', '账号管理': '51234', '反馈记录': '7acdb', '红线必答': '33eac', '数据分析': '1513d', '系统管理': '86bd2' };
const detailSections = [['bio','个人简介'], ['education','教育经历（中文）'], ['educationEn','教育经历（英文）'], ['work','工作经历（中文）'], ['workEn','工作经历（英文）'], ['social','社会兼职'], ['honors','荣誉奖励']];
const labelMap = { name: '姓名', rank: '职级', unit: '所属单位', department: '院系', email: '邮箱', adjunct: '是否清华兼聘教授' };

export function persist() { if (!store.save()) toast('浏览器存储空间不足，本次修改暂未持久保存。可从账号菜单导出备份。', 'error'); }
function header() {
  return `<header class="topbar"><a href="#experts" class="brand" aria-label="AI智库共创管理平台首页"><span class="brand-mark">AI</span><span>AI智库共创管理平台</span></a><button class="account" type="button" data-action="account" aria-expanded="${ui.account}" aria-label="管理员菜单"><span class="account-avatar">ad</span><span class="account-name">admin<small>超级管理员</small></span>${icon('42027')}</button>${ui.account ? `<div class="account-menu"><div class="menu-caption">交互原型 · 前端交付</div>${btn('使用说明与设计对应', 'guide') }<a href="./handoff/experts-frontend-source.zip" download>下载前端源码</a>${btn('导出当前浏览器数据', 'export-data')}${btn('恢复示例数据', 'reset-data')}</div>` : ''}</header>`;
}
function nav() {
  let group = '';
  return `<aside class="sidebar ${ui.collapsed ? 'collapsed' : ''} ${ui.mobileOpen ? 'expanded-mobile' : ''}" aria-label="主导航"><nav class="nav-menu">${seed.nav.map(item => {
    if (!item.child) group = item.label;
    if (item.child && !ui.groups.has(group)) return '';
    const selected = item.label === '专家管理'; const expandable = item.expanded !== null;
    return `<button type="button" class="nav-item ${item.child ? 'child' : ''} ${selected ? 'selected' : ''}" data-action="nav" data-name="${esc(item.label)}" title="${esc(item.label)}" ${selected ? 'aria-current="page"' : ''} ${expandable ? `aria-expanded="${ui.groups.has(item.label)}"` : ''}>${navAssets[item.label] ? icon(navAssets[item.label]) : ''}<span class="nav-label">${esc(item.label)}</span>${expandable ? icon(ui.groups.has(item.label)?'8a1f1':'196a2', 'nav-arrow ' + (ui.groups.has(item.label) ? 'open' : '')) : ''}</button>`;
  }).join('')}</nav><button class="sidebar-fold" data-action="collapse" aria-label="${ui.collapsed ? '展开' : '收起'}侧栏">${ui.collapsed ? '›' : '‹'}</button></aside>`;
}
function inlineFilter(label, name, control, cls = '') { return `<label class="inline-field ${cls}"><span>${label}</span>${control}</label>`; }
function filterForm() {
  const f = ui.filterDraft;
  const minimumAttrs = 'type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" placeholder="请输入"';
  return `<form class="filters" id="filter-form">
    <div class="filter-bar">
      <div class="filter-fields">${inlineFilter('姓名','name',input('name', f.name, 'placeholder="请输入"'))}${inlineFilter('研究方向','research',input('research', f.research, 'placeholder="请输入"'),'research')}${inlineFilter('专家职级','rank',select('rank', ranks, f.rank, '请选择', 'data-designed-select data-select-label="专家职级" data-menu-height="186"'))}${inlineFilter('状态','status',select('status', ['启用','关闭'], f.status, '请选择', 'data-designed-select data-select-label="状态" data-menu-height="80"'),'status')}</div>
      <div class="filter-actions">${btn(ui.expanded ? '收起' : '展开','expand-filters','',`aria-expanded="${ui.expanded}" aria-controls="advanced-filters"`)}<button class="btn primary" type="submit">查询</button>${btn('重置','reset-filters')}</div>
    </div>
    ${ui.expanded ? `<div class="advanced-fields" id="advanced-filters" role="group" aria-label="高级筛选条件">${inlineFilter('院系/智库机构','department',input('department',f.department,'placeholder="请输入"'),'department')}${inlineFilter('论文数不少于','minPapers',input('minPapers',f.minPapers,minimumAttrs),'minimum')}${inlineFilter('引用数不少于','minCites',input('minCites',f.minCites,minimumAttrs),'minimum')}</div>` : ''}
  </form>`;
}
function renderFilterForm() { document.getElementById('filter-form').outerHTML = filterForm(); enhanceSelects(document.getElementById('filter-form')); }
function queryExperts() {
  readFilters();
  const invalidMinimum = ['minPapers','minCites'].some(key => {
    const value = String(ui.filterDraft[key] ?? '').trim();
    return value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0);
  });
  if (invalidMinimum) {
    ui.expanded = true;
    renderFilterForm();
    document.getElementById('filter-form').reportValidity();
    return;
  }
  ui.filters = {...ui.filterDraft};
  ui.page = 1;
  ui.selection.clear();
  renderList();
}
function filteredExperts() {
  const list = filterExperts(store.state.experts, ui.filters);
  if (ui.sort) list.sort((a,b) => (typeof a[ui.sort] === 'number' ? a[ui.sort] - b[ui.sort] : String(a[ui.sort]).localeCompare(String(b[ui.sort]), 'zh-CN')) * ui.sortDirection);
  return list;
}
function visibleExperts() { const list = filteredExperts(); ui.page = Math.max(1,Math.min(ui.page,Math.ceil(list.length/ui.size) || 1)); return list.slice((ui.page-1)*ui.size, ui.page*ui.size); }
function sortHead(label, key) { return `<button class="sort-button" data-action="sort" data-key="${key}" title="按${label}排序">${label}${ui.sort === key ? `<span class="sort-indicator"> ${ui.sortDirection === 1 ? '▲' : '▼'}</span>` : ''}</button>`; }
function table() {
  const rows = visibleExperts(); const selected = rows.filter(e => ui.selection.has(e.id)).length;
  const widths = [42,176,128,160,160,192,256,128,128,176,128,128];
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="专家列表，可横向滚动查看全部列"><table class="expert-table"><colgroup>${widths.map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr><th><input type="checkbox" id="select-all" aria-label="选择本页全部专家" ${rows.length && selected === rows.length ? 'checked' : ''}></th><th>ID</th><th>${sortHead('专家职级','rank')}</th><th>头像</th><th>${sortHead('姓名','name')}</th><th>单位与职称</th><th>研究方向</th><th>${sortHead('发表论文数','papers')}</th><th>${sortHead('被引用数','cites')}</th><th>院系/智库机构</th><th>状态</th><th class="operation">操作</th></tr></thead><tbody>${rows.map(e => `<tr data-id="${esc(e.id)}" class="${ui.selection.has(e.id) ? 'is-selected' : ''}" style="height:${e.rowHeight || 100}px"><td><input type="checkbox" class="select-expert" data-id="${esc(e.id)}" aria-label="选择${esc(e.name)}" ${ui.selection.has(e.id) ? 'checked' : ''}></td><td class="id-cell">${esc(e.id)}</td><td><span class="tag rank">${esc(e.rank)}</span></td><td>${portrait(e)}</td><td><a class="expert-name" href="#expert/${encodeURIComponent(e.id)}" title="查看${esc(e.name)}详情">${esc(e.name)}</a></td><td class="unit-cell"><p>${esc(e.unit) || '–'}</p><p>${esc(e.title) || '–'}</p></td><td class="research-cell"><span class="clamp" title="${esc(e.research)}">${esc(e.research) || '–'}</span></td><td>${e.papers}</td><td>${e.cites}</td><td>${esc(e.department.join(';')) || '–'}</td><td><span class="tag ${e.status === '启用' ? 'success' : 'info'}">${esc(e.status)}</span></td><td class="operation"><div class="row">${btn(e.status === '启用' ? '关闭' : '启用','toggle-status','link ' + (e.status === '启用' ? 'danger' : ''),`data-id="${esc(e.id)}" aria-label="${e.status === '启用' ? '关闭' : '启用'}${esc(e.name)}"`)}${btn('编辑','open-expert','link',`data-id="${esc(e.id)}" aria-label="编辑${esc(e.name)}"`)}</div></td></tr>`).join('') || `<tr><td colspan="12"><div class="empty-state"><strong>未找到符合条件的专家</strong><span>请尝试更换关键词或清空筛选条件</span>${btn('清空筛选','reset-filters')}</div></td></tr>`}</tbody></table></div>`;
}
function portrait(e, profile = false) { return e.photo ? `<img class="${profile ? 'profile-photo' : 'portrait'}" src="${esc(e.photo)}" alt="${esc(e.name)}头像" ${profile ? '' : `width="60" height="${e.photoHeight || 75}"`} ${profile ? '' : 'loading="lazy"'}>` : `<span class="portrait-empty" role="img" aria-label="暂无头像">${esc(e.name[0] || '人')}</span>`; }
function pagination() {
  const count = filteredExperts().length; const pages = Math.ceil(count/ui.size) || 1;
  const nums = [...new Set([1,...[ui.page-1,ui.page,ui.page+1].filter(n=>n>0&&n<=pages),pages])].sort((a,b)=>a-b);
  return `<footer class="pagination"><span>共 ${count} 条</span><nav class="page-buttons" aria-label="列表分页">${btn('‹','page','',`data-page="${ui.page-1}" aria-label="上一页" ${ui.page===1?'disabled':''}`)}${nums.map((n,i)=>`${i>0&&n-nums[i-1]>1?'<span class="btn" aria-hidden="true">…</span>':''}${btn(String(n),'page',ui.page===n?'active':'',`data-page="${n}" ${ui.page===n?'aria-current="page"':''}`)}`).join('')}${btn('›','page','',`data-page="${ui.page+1}" aria-label="下一页" ${ui.page===pages?'disabled':''}`)}</nav><select class="control" id="page-size" aria-label="每页显示条数" data-designed-select data-select-label="每页显示条数" data-menu-height="182" data-placement="top">${options([10,20,50,100,200].map(n=>[n,n+'条/页']),ui.size)}</select><label class="jump-label">前往<input type="number" class="control page-jump" id="page-jump" min="1" max="${pages}" aria-label="跳转页码">页</label></footer>`;
}
function renderList() {
  currentExpertId = null;
  root.innerHTML = `${header()}<div class="workspace">${nav()}<main class="list-main" id="main"><h1 class="page-title">${btn('☰','mobile-nav','icon-btn mobile-toggle','aria-label="展开导航"')}专家管理<span class="selection-info" id="selection-info">${ui.selection.size ? `已选择 ${ui.selection.size} 位专家` : ''}</span></h1><div class="toolbar"><div class="actions">${btn('批量启用','batch-enable')}${btn('批量关闭','batch-disable')}${btn('批量删除','batch-delete','danger')}${btn('添加专家','add-expert','primary')}${btn('批量导入成果','batch-import','primary')}${btn('批量导入历史','history')}</div><div class="publish"><time title="${esc(store.state.publishedAt || '还未发布')}">上次发布时间：${store.state.publishedAt ? esc(store.state.publishedAt) : '还未发布...'}</time>${btn('发布','publish','primary')}</div></div>${filterForm()}${table()}${pagination()}</main></div>`;
  const rows = visibleExperts(); const selected = rows.filter(e=>ui.selection.has(e.id)).length;
  const all = document.getElementById('select-all'); if (all) all.indeterminate = selected>0&&selected<rows.length;
  enhanceSelects(root);
}
function detailDepartment(e) { return store.detail(e.id).departmentLabel || e.department.join('；'); }
function basicInfo(e) { return `<table class="basic-table"><tbody>${Object.entries(labelMap).map(([key,label])=>`<tr><td>${label}</td><td>${esc(key==='adjunct'?(e.adjunct?'是':'否'):key==='department'?detailDepartment(e):e[key]) || '–'}</td></tr>`).join('')}</tbody></table>`; }
function card(id,title,content,actions='') { return `<section class="detail-card" id="${id}"><header class="card-head"><h2>${title}</h2><div class="row">${actions}</div></header><div class="card-body">${content}</div></section>`; }
function renderDetail(id) {
  const e = store.getExpert(id); if (!e) { location.hash='#experts'; toast('该专家已不存在。','info'); return; }
  currentExpertId = id;
  const d = store.detail(id);
  root.innerHTML = `${header()}<main class="detail-scroll" id="main">${btn('← 返回专家管理','back-list','back-button')}<section class="profile-hero">${portrait(e,true)}<div class="profile-identity"><h1>${esc(e.name)}</h1><p>${esc(e.title)}　${esc(e.unit)}　${esc(detailDepartment(e))}</p></div><div class="row">${btn('成果栏目','columns')}${btn('导入成果','single-import','primary')}</div></section>${card('basic-info','基本信息',basicInfo(e),btn('编辑','edit-expert','',`data-id="${esc(e.id)}"`))}${detailSections.map(([key,label])=>card('section-'+key,label,d[key]?.length ? `<div class="paragraphs">${d[key].map(text=>`<p>${esc(text)}</p>`).join('')}</div>` : empty(),btn(d[key]?.length?'编辑':'＋ 添加','edit-text','',`data-key="${key}"`))).join('')}${card('research-tags','研究方向',`<div class="tag-list">${d.researchTags.map(t=>`<span class="tag purple">${esc(t)}</span>`).join('') || esc(e.research) || empty()}</div>`,btn('编辑','edit-text','', 'data-key="researchTags"'))}${seed.order.map(type => achievementSection(type,d)).join('')}${card('academic-stats','学术指标',`<div class="metrics">${Object.entries(d.stats).map(([key,val])=>`<div class="metric"><strong>${esc(val)}</strong><small>${key.toUpperCase()} 指数</small></div>`).join('')}</div>`)}${card('research-fields','研究领域',dataTable(['研究领域（英文）','中文名称','出现次数','年度分布'],d.fields))}${card('collaborators','合作学者',dataTable(['姓名','合作次数'],d.collaborators))}${card('institutions','合作机构',dataTable(['机构名称（中文）','机构名称（英文）','合作次数'],d.institutions))}</main>`;
}
function achievementSection(type,d) { const rows = d[detailKeys[type]] || []; return card('achievement-'+type,`${seed.names[type]} <span class="muted small-text">（${rows.length}）</span>`,dataTable(seed.schemas[type],rows,type),btn('＋ 添加','add-achievement','',`data-type="${type}"`)); }
function dataTable(headers,rows,type) {
  if (!rows?.length) return empty();
  return `<div class="data-table-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}${type?'<th>操作</th>':''}</tr></thead><tbody>${rows.map((row,index)=>`<tr>${row.map((v,i)=>`<td>${headers[i]==='来源链接'&&safeLink(v)?`<a href="${esc(safeLink(v))}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:esc(v)||'–'}</td>`).join('')}${type?`<td class="data-actions">${btn('编辑','edit-achievement','link',`data-type="${type}" data-index="${index}"`)}${btn('删除','delete-achievement','link danger',`data-type="${type}" data-index="${index}"`)}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function render() {
  const match = location.hash.match(/^#expert\/([^/?]+)/); const id = match ? decodeURIComponent(match[1]) : null;
  if (id) renderDetail(id); else renderList();
  document.title = (id&&store.getExpert(id)?store.getExpert(id).name+' · 专家详情':'专家管理')+' · AI智库共创管理平台';
}
function refreshKeepingScroll() { const scroller=document.querySelector('.detail-scroll,.table-scroll');const top=scroller?.scrollTop || 0;const left=scroller?.scrollLeft || 0; render(); const next=document.querySelector('.detail-scroll,.table-scroll');if(next){next.scrollTop=top;next.scrollLeft=left;} }
function readFilters() { const form = document.getElementById('filter-form'); if(form) ui.filterDraft={...ui.filterDraft,...Object.fromEntries(new FormData(form))}; }
function ask(title,message,callback,label='确认',danger=false) { confirmAction=callback;showModal({title,body:`<div class="guide">${message}</div>`,footer:btn('取消','close-modal')+btn(label,'confirm',danger?'danger-fill':'primary'),width:440}); }
function updateSelection() {
  const selected=ui.selection.size;document.getElementById('selection-info').textContent=selected?`已选择 ${selected} 位专家`:'';
  document.querySelectorAll('.select-expert').forEach(box=>{box.checked=ui.selection.has(box.dataset.id);box.closest('tr').classList.toggle('is-selected',box.checked);});
  const boxes=[...document.querySelectorAll('.select-expert')]; const all=document.getElementById('select-all');const count=boxes.filter(b=>b.checked).length;all.checked=!!boxes.length&&count===boxes.length;all.indeterminate=count>0&&count<boxes.length;
}
function expertForm(id) {
  const e = id ? store.getExpert(id) : {name:'',rank:'',title:'',unit:'',department:[],email:'',adjunct:false,research:'',photo:''};
  draftExpertId=id || null; avatarValue=e.photo || '';
  const departments=[...new Set(['材料学院','清华大学材料科学与工程研究院','化学系','环境学院','机械工程学院','计算机科学与技术系','公共管理学院','智库中心',...store.state.experts.flatMap(x=>x.department)])].filter(x=>x&&x!=='-');
  showModal({title:id?'编辑专家':'添加专家',className:'expert-form-modal',width:560,body:`<form class="form-stack" id="expert-form"><div class="form-error" id="expert-error" role="alert"></div><div class="field"><span>头像<span class="required">*</span></span><div class="avatar-upload"><button type="button" class="avatar-picker" data-action="pick-avatar" aria-label="上传专家头像" id="avatar-preview">${avatarValue?`<img src="${esc(avatarValue)}" alt="头像预览">`:'＋'}</button><input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" hidden><span class="muted small-text">JPG、PNG、WebP，最大 2MB</span></div></div>${field('姓名<span class="required">*</span>',input('name',e.name,'required maxlength="50" placeholder="请输入"'))}${field('专家职级<span class="required">*</span>',select('rank',ranks,e.rank,'请选择','required'))}${field('职称',input('title',e.title,'maxlength="100" placeholder="请输入"'))}${field('所属单位',input('unit',e.unit,'maxlength="100" placeholder="请输入"'))}<div class="field"><span>院系</span><details class="multiselect"><summary class="control" id="department-summary">${e.department.length?`<span class="selected-depts">${esc(e.department.join('；'))}</span>`:'请选择（多选）'}</summary><div class="multiselect-panel">${departments.map(d=>`<label><input type="checkbox" name="department" value="${esc(d)}" ${e.department.includes(d)?'checked':''}>${esc(d)}</label>`).join('')}</div></details></div>${field('邮箱',input('email',e.email,'type="email" maxlength="120" placeholder="请输入"'))}<label class="field"><span>是否清华兼聘教授</span><span class="switch-label"><input type="checkbox" role="switch" class="switch" name="adjunct" ${e.adjunct?'checked':''} aria-label="是否清华兼聘教授"><span id="switch-text">${e.adjunct?'是':'否'}</span></span></label>${field('研究方向',`<textarea class="control" name="research" rows="3" maxlength="6000" placeholder="请输入">${esc(e.research)}</textarea>`)}</form>`,footer:btn('取消','close-modal')+'<button class="btn primary" type="submit" form="expert-form">保存</button>'});
}
function saveExpert(form) {
  const values=new FormData(form);const name=String(values.get('name') || '').trim();const rank=values.get('rank');
  const error=document.getElementById('expert-error');
  if(!avatarValue||!name||!rank){error.textContent=!avatarValue?'请上传专家头像。':'请完整填写姓名和专家职级。';error.classList.add('visible');return;}
  const before=draftExpertId?store.getExpert(draftExpertId):{id:crypto.randomUUID().replaceAll('-','').slice(0,24),status:'启用',papers:0,cites:0,rowHeight:100,photoHeight:76};
  store.upsert({...before,name,rank,title:String(values.get('title')||'').trim(),unit:String(values.get('unit')||'').trim(),department:values.getAll('department'),email:String(values.get('email')||'').trim(),adjunct:values.has('adjunct'),research:String(values.get('research')||'').trim(),photo:avatarValue});
  if(draftExpertId&&before.department.join(';')!==values.getAll('department').join(';'))delete store.detail(draftExpertId).departmentLabel;
  persist();closeModal();if(!draftExpertId){ui.page=1;ui.filters={};ui.filterDraft={};}refreshKeepingScroll();toast(draftExpertId?'专家信息已更新':'专家已添加');
}
async function readAvatar(file) {
  if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片。','error');return;}if(file.size>2*1024*1024){toast('头像文件不能超过 2MB。','error');return;}
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  const img=new Image();img.src=data;try{await img.decode();}catch{toast('图片无法读取，请重新选择。','error');return;}
  const scale=Math.min(1,360/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);avatarValue=canvas.toDataURL('image/webp',.85);document.getElementById('avatar-preview').innerHTML=`<img src="${avatarValue}" alt="头像预览">`;
}
function editText(key) {
  editTextKey=key;const d=store.detail(currentExpertId);const label=detailSections.find(x=>x[0]===key)?.[1]||'研究方向标签';
  showModal({title:'编辑'+label,body:`<form id="text-form" class="form-stack">${field(label,`<textarea class="control" name="text" rows="12" maxlength="20000" placeholder="每行填写一段内容">${esc((d[key]||[]).join('\n\n'))}</textarea>`)}<p class="muted small-text">段落之间使用空行分隔；每行也可以填写一条经历或标签。</p></form>`,footer:btn('取消','close-modal')+'<button class="btn primary" type="submit" form="text-form">保存</button>',width:720});
}
function achievementForm(type,index=-1) {
  editEntryType=type;editEntryIndex=index;const d=store.detail(currentExpertId);const values=index>=0?d[detailKeys[type]][index]:[];
  showModal({title:(index>=0?'编辑':'添加')+seed.names[type],width:720,body:`<form id="achievement-form" class="form-two-cols"><div class="form-error wide" id="achievement-error" role="alert"></div>${seed.schemas[type].map((label,i)=>field(esc(label)+(i===0?'<span class="required">*</span>':''),input('field'+i,values[i],`${i===0?'required':''} maxlength="2000" placeholder="请输入"`),i===0?'wide':'')).join('')}</form>`,footer:btn('取消','close-modal')+'<button class="btn primary" type="submit" form="achievement-form">保存</button>'});
}
function saveAchievement(form) {
  const fd=new FormData(form);const fields=seed.schemas[editEntryType].map((_,i)=>String(fd.get('field'+i)||'').trim());if(!fields[0])return;
  const rows=store.detail(currentExpertId)[detailKeys[editEntryType]];if(rows.some((r,i)=>i!==editEntryIndex&&r[0].trim().toLowerCase()===fields[0].toLowerCase())){const err=document.getElementById('achievement-error');err.textContent='该成果名称已存在，请避免重复添加。';err.classList.add('visible');return;}
  if(editEntryIndex>=0)rows[editEntryIndex]=fields;else rows.push(fields);persist();closeModal();refreshKeepingScroll();toast('成果已保存');
}
function showColumns() {const d=store.detail(currentExpertId);showModal({title:'成果栏目',width:440,body:`<div class="column-menu">${seed.order.map(t=>`<a href="#" data-action="jump-column" data-type="${t}"><span>${seed.names[t]}</span><span class="muted">${d[detailKeys[t]].length} 条　›</span></a>`).join('')}</div>`,footer:btn('关闭','close-modal')});}
function guide() {showModal({title:'交互原型与前端交付',width:720,body:`<div class="guide"><p>本页面按「AI智库」Figma 专家管理设计制作，覆盖专家列表、详情、资料编辑、七类成果维护及导入核对。</p><ul><li>可查询姓名、研究方向、职级、状态及展开的高级条件。</li><li>点击专家姓名或列表「编辑」进入详情，再点击对应分区的「编辑」打开修改弹窗；点击「成果栏目」快速定位。</li><li>下方可体验批量导入示例或下载 JSON 示例；也可在导入弹窗中使用 CSV / JSON / XLSX 模板实际导入。Word、旧版 XLS 和自由文本智能识别需要后端服务。</li><li>数据只保存在当前浏览器。不同人的操作互不影响；「发布」保存本地演示状态。</li><li>样例包含 ${seed.experts.length} 位专家，Figma 中的 4009 条原站总数未作为虚构数据填充。</li></ul><p>源码采用原生 HTML / CSS / ES Modules，运行 <code>npm run dev</code> 即可预览，无需安装依赖。项目附带设计标记、接口建议和验证记录。</p><p><a href="https://www.figma.com/design/JQVfoShBY5oSLGqSm9Oonm/AI智库?node-id=164257-44" target="_blank" rel="noopener noreferrer">查看 Figma 设计 ↗</a>　<a href="./handoff/README.md" target="_blank">阅读前端交付说明 ↗</a></p></div>`,footer:btn('体验批量导入示例','imp-batch-sample')+btn('下载 JSON 示例','imp-batch-json-template')+'<a class="btn primary" href="./handoff/experts-frontend-source.zip" download>下载前端源码</a>'+btn('关闭','close-modal')});}

document.addEventListener('click',async event=>{
  if(!store)return;
  const target=event.target.closest('[data-action]'); if(!target){if(ui.account&&!event.target.closest('.account-menu')){ui.account=false;const menu=document.querySelector('.account-menu');menu?.remove();document.querySelector('.account')?.setAttribute('aria-expanded','false');}return;}
  if(target.disabled)return;const action=target.dataset.action;
  if(imports?.handleAction(action,target,event))return;
  switch(action){
    case 'close-modal': closeModal();break;
    case 'confirm': {const callback=confirmAction;confirmAction=null;closeModal();callback?.();break;}
    case 'account': ui.account=!ui.account;refreshKeepingScroll();break;
    case 'guide': ui.account=false;guide();break;
    case 'export-data': download('AI智库-浏览器数据备份.json',JSON.stringify(store.state,null,2),'application/json');break;
    case 'reset-data':ask('恢复示例数据','恢复后将清空本浏览器中新增和修改的专家、成果与导入记录。',()=>{store.reset();ui.filters={};ui.filterDraft={};ui.selection.clear();ui.page=1;closeModal();if(location.hash!=='#experts')location.hash='#experts';else render();toast('已恢复示例数据');},'恢复',true);break;
    case 'collapse': ui.collapsed=!ui.collapsed;document.querySelector('.sidebar').classList.toggle('collapsed',ui.collapsed);break;
    case 'mobile-nav':ui.mobileOpen=!ui.mobileOpen;document.querySelector('.sidebar').classList.toggle('expanded-mobile',ui.mobileOpen);break;
    case 'nav':{const name=target.dataset.name;if(seed.nav.find(x=>x.label===name)?.expanded!==null){if(ui.groups.has(name))ui.groups.delete(name);else ui.groups.add(name);document.querySelector('.sidebar').outerHTML=nav();}else if(name==='专家管理'){location.hash='#experts';ui.mobileOpen=false;render();}else toast('本次交互范围为专家管理，请从专家列表继续体验。','info');break;}
    case 'expand-filters':readFilters();ui.expanded=!ui.expanded;renderFilterForm();document.querySelector('[data-action="expand-filters"]').focus({preventScroll:true});break;
    case 'reset-filters':ui.filters={};ui.filterDraft={};ui.page=1;ui.selection.clear();renderList();break;
    case 'sort':ui.sortDirection=ui.sort===target.dataset.key?-ui.sortDirection:1;ui.sort=target.dataset.key;renderList();break;
    case 'page':ui.page=Number(target.dataset.page);renderList();break;
    case 'toggle-status':{const e=store.getExpert(target.dataset.id);e.status=e.status==='启用'?'关闭':'启用';persist();refreshKeepingScroll();toast(`${e.name}已${e.status}`);break;}
    case 'batch-enable':case 'batch-disable':case 'batch-delete':{
      if(!ui.selection.size){toast('请选择需要操作的专家','plain');break;}
      const ids=[...ui.selection];const remove=action==='batch-delete';const verb=remove?'删除':action==='batch-enable'?'启用':'关闭';
      ask('批量'+verb,`确定${verb}选中的 ${ids.length} 位专家${remove?'及其本地成果数据':''}？`,()=>{if(remove){store.delete(ids);ui.selection.clear();}else for(const id of ids){const e=store.getExpert(id);if(e)e.status=verb;}persist();renderList();toast(`已${verb} ${ids.length} 位专家`);},'确认'+verb,remove);break;
    }
    case 'add-expert':expertForm();break;
    case 'open-expert':readFilters();location.hash='#expert/'+encodeURIComponent(target.dataset.id);break;
    case 'edit-expert':expertForm(target.dataset.id||currentExpertId);break;
    case 'pick-avatar':document.getElementById('avatar-file').click();break;
    case 'publish':ask('发布专家资料','确认将当前专家资料标记为已发布？此操作演示发布流程，数据保存在当前浏览器。',()=>{store.state.publishedAt=new Date().toLocaleString('zh-CN',{hour12:false});persist();renderList();toast('发布状态已保存');},'确认发布');break;
    case 'back-list':location.hash='#experts';break;
    case 'columns':showColumns();break;
    case 'jump-column':event.preventDefault();closeModal();document.getElementById('achievement-'+target.dataset.type)?.scrollIntoView({behavior:'smooth',block:'start'});break;
    case 'edit-text':editText(target.dataset.key);break;
    case 'add-achievement':achievementForm(target.dataset.type);break;
    case 'edit-achievement':achievementForm(target.dataset.type,Number(target.dataset.index));break;
    case 'delete-achievement':{const type=target.dataset.type;const index=Number(target.dataset.index);ask('删除成果',`确定删除「${esc(store.detail(currentExpertId)[detailKeys[type]][index][0])}」？`,()=>{store.detail(currentExpertId)[detailKeys[type]].splice(index,1);persist();refreshKeepingScroll();toast('成果已删除');},'删除',true);break;}
  }
});
document.addEventListener('submit',event=>{
  if(!store)return;const form=event.target;
  if(form.id==='filter-form'){event.preventDefault();queryExperts();}
  else if(form.id==='expert-form'){event.preventDefault();saveExpert(form);}
  else if(form.id==='text-form'){event.preventDefault();const text=new FormData(form).get('text');store.detail(currentExpertId)[editTextKey]=String(text).split(/\n\s*\n|\n/).map(t=>t.trim()).filter(Boolean);persist();closeModal();refreshKeepingScroll();toast('内容已保存');}
  else if(form.id==='achievement-form'){event.preventDefault();saveAchievement(form);}
});
document.addEventListener('input',event=>{if(event.target.closest('#filter-form'))readFilters();});
document.addEventListener('change',event=>{
  if(!store)return;const target=event.target;
  if(target.closest('#filter-form'))readFilters();
  if(imports?.handleChange(target))return;
  if(target.id==='select-all'){for(const e of visibleExperts()){if(target.checked)ui.selection.add(e.id);else ui.selection.delete(e.id);}updateSelection();}
  else if(target.classList.contains('select-expert')){if(target.checked)ui.selection.add(target.dataset.id);else ui.selection.delete(target.dataset.id);updateSelection();}
  else if(target.id==='page-size'){ui.size=Number(target.value);ui.page=1;renderList();}
  else if(target.id==='page-jump'){ui.page=Number(target.value)||1;renderList();}
  else if(target.id==='avatar-file'){readAvatar(target.files[0]).catch(()=>toast('头像无法读取。','error'));}
  else if(target.name==='department'&&target.closest('#expert-form')){const names=[...document.querySelectorAll('#expert-form [name="department"]:checked')].map(x=>x.value);document.getElementById('department-summary').innerHTML=names.length?`<span class="selected-depts">${esc(names.join('；'))}</span>`:'请选择（多选）';}
  else if(target.name==='adjunct'&&target.closest('#expert-form'))document.getElementById('switch-text').textContent=target.checked?'是':'否';
});
window.addEventListener('hashchange',()=>{if(store){closeModal();ui.account=false;render();}});
window.addEventListener('storage',event=>{if(event.key==='ai-thinktank-experts-v1')toast('另一标签页的数据已更新，刷新后可载入。','info');});

async function boot(){
  try{
    const response=await fetch('./data.json');if(!response.ok)throw new Error('数据载入失败');seed=await response.json();store=createStore(seed);
    imports=createImportController({seed,store,persist,refresh:refreshKeepingScroll,getExpertId:()=>currentExpertId});
    if(!location.hash)history.replaceState(null,'','#experts');render();if(store.readWarning)toast(store.readWarning,'info');
  }catch(error){console.error(error);root.innerHTML=`<main class="loading-error"><h1>页面暂时无法载入</h1><p>请刷新页面重试，或使用本地 HTTP 服务打开源码。</p><p class="muted">${esc(error.message)}</p><button class="btn primary" type="button" onclick="location.reload()">重新载入</button></main>`;}
}
boot();
