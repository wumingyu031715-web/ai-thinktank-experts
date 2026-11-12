export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const icon = (name, cls = '') => `<img class="icon ${cls}" src="./assets/icons/${name}.svg" alt="" aria-hidden="true">`;
export const button = (label, action, cls = '', attrs = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
export const options = (items, selected, placeholder) => `${placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : ''}${items.map(item => { const [value, label] = Array.isArray(item) ? item : [item, item]; return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}`;
export const field = (label, content, cls = '') => `<label class="field ${cls}"><span>${label}</span>${content}</label>`;
export const input = (name, value = '', attrs = '') => `<input class="control" name="${esc(name)}" value="${esc(value)}" ${attrs}>`;
export const select = (name, choices, selected, placeholder, attrs = '') => `<select class="control" name="${esc(name)}" ${attrs}>${options(choices, selected, placeholder)}</select>`;
export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = message; root.append(el);
  setTimeout(() => el.remove(), 4500);
}
let activeModal = null;
export function closeModal() {
  if (!activeModal) return;
  const { dialog, returnFocus } = activeModal; activeModal = null; dialog.close(); dialog.remove(); returnFocus?.focus();
}
export function showModal({ title, body, footer = '', width = 560, className = '', onClose }) {
  const previous = activeModal?.returnFocus || document.activeElement;
  if (activeModal) { activeModal.dialog.close(); activeModal.dialog.remove(); }
  const dialog = document.createElement('dialog'); dialog.className = `modal ${className}`; dialog.style.setProperty('--modal-width', width + 'px');
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.innerHTML = `<header class="modal-head"><h2 id="modal-title">${esc(title)}</h2>${button(icon('a5661'), 'close-modal', 'icon-btn', 'aria-label="关闭弹窗"')}</header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}`;
  document.getElementById('modal-root').append(dialog); activeModal = { dialog, returnFocus: previous };
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (onClose) onClose(); else closeModal(); });
  dialog.addEventListener('click', e => { if (e.target === dialog && (e.clientX < dialog.getBoundingClientRect().left || e.clientX > dialog.getBoundingClientRect().right || e.clientY < dialog.getBoundingClientRect().top || e.clientY > dialog.getBoundingClientRect().bottom)) { if (onClose) onClose(); else closeModal(); } });
  dialog.showModal();
  return dialog;
}
export function download(name, content, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const empty = (message = '暂无数据') => `<div class="empty">${esc(message)}</div>`;
export function safeLink(value) { try { const u = new URL(value.startsWith('http') ? value : 'https://' + value); return ['http:', 'https:'].includes(u.protocol) && !/^(javascript|data|vbscript):/i.test(value) ? u.href : ''; } catch { return ''; } }

let activeSelect = null;
function closeSelectMenu() {
  if (!activeSelect) return;
  const { trigger, menu } = activeSelect;
  activeSelect = null;
  if (menu.matches(':popover-open')) menu.hidePopover();
  menu.remove();
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
}
export function enhanceSelects(scope = document) {
  closeSelectMenu();
  scope.querySelectorAll('select[data-designed-select]').forEach(native => {
    if (native.closest('.designed-select')) return;
    const shell = document.createElement('span'); shell.className = 'designed-select';
    native.before(shell); shell.append(native);
    native.tabIndex = -1; native.setAttribute('aria-hidden', 'true');
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'control select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', native.dataset.selectLabel);
    const menuId = `select-menu-${native.id || native.name}`;
    trigger.setAttribute('aria-controls', menuId);
    shell.append(trigger);
    function sync() {
      const option = native.selectedOptions[0];
      trigger.innerHTML = `<span class="select-value ${option?.value === '' ? 'placeholder' : ''}">${esc(option?.textContent || '')}</span>${icon('a8351')}`;
      trigger.disabled = native.disabled;
    }
    sync(); native.addEventListener('change', sync);
    function open(direction = 1) {
      closeSelectMenu();
      const choices = [...native.options].filter(option => option.value !== '' && !option.disabled);
      const menu = document.createElement('div');
      menu.id = menuId; menu.className = 'select-menu'; menu.setAttribute('popover', 'manual');
      menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', native.dataset.selectLabel);
      menu.innerHTML = choices.map((option, index) => `<div role="option" class="select-option" id="${menuId}-${index}" aria-selected="${option.selected}" data-index="${index}">${esc(option.textContent)}</div>`).join('');
      document.body.append(menu);
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Number(native.dataset.menuHeight || choices.length * 34 + 14);
      const spaceBelow = innerHeight - rect.bottom - 20;
      const placeAbove = native.dataset.placement === 'top' || spaceBelow < Math.min(menuHeight, 100);
      const available = placeAbove ? rect.top - 16 : spaceBelow;
      const height = Math.min(menuHeight, Math.max(34, available));
      menu.style.width = rect.width + 'px'; menu.style.height = height + 'px';
      menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)) + 'px';
      menu.style.top = (placeAbove ? Math.max(8, rect.top - 8 - height) : rect.bottom + 12) + 'px';
      let index = choices.findIndex(option => option.selected);
      if (index < 0) index = direction < 0 ? choices.length - 1 : 0;
      const setActive = next => {
        index = (next + choices.length) % choices.length;
        menu.querySelectorAll('[role="option"]').forEach((option, i) => option.classList.toggle('is-active', index === i));
        trigger.setAttribute('aria-activedescendant', `${menuId}-${index}`);
        menu.children[index]?.scrollIntoView({block:'nearest'});
      };
      const choose = next => {
        native.value = choices[next].value;
        closeSelectMenu(); trigger.focus({preventScroll:true});
        native.dispatchEvent(new Event('change', {bubbles:true}));
      };
      activeSelect = {trigger, menu, setActive, choose, get index() {return index;}, count:choices.length};
      trigger.setAttribute('aria-expanded', 'true');
      if (menu.showPopover) menu.showPopover(); else menu.classList.add('is-open');
      setActive(index);
      menu.addEventListener('pointerdown', event => event.preventDefault());
      menu.addEventListener('pointermove', event => {const option=event.target.closest('[role="option"]');if(option)setActive(Number(option.dataset.index));});
      menu.addEventListener('click', event => {const option=event.target.closest('[role="option"]');if(option)choose(Number(option.dataset.index));});
    }
    trigger.addEventListener('click', () => activeSelect?.trigger === trigger ? closeSelectMenu() : open());
    trigger.addEventListener('keydown', event => {
      const active = activeSelect?.trigger === trigger ? activeSelect : null;
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        if (!active) open(event.key === 'ArrowUp' ? -1 : 1);
        else {active.menu.classList.add('keyboard-mode');active.setActive(event.key === 'Home' ? 0 : event.key === 'End' ? active.count - 1 : active.index + (event.key === 'ArrowUp' ? -1 : 1));}
      } else if (['Enter',' '].includes(event.key)) {
        event.preventDefault(); if (active) active.choose(active.index); else open();
      } else if (event.key === 'Escape' && active) {event.preventDefault();closeSelectMenu();}
      else if (event.key === 'Tab') closeSelectMenu();
    });
  });
}
document.addEventListener('pointerdown', event => {
  if (activeSelect && !activeSelect.trigger.contains(event.target) && !activeSelect.menu.contains(event.target)) closeSelectMenu();
});
window.addEventListener('resize', closeSelectMenu);
window.addEventListener('hashchange', closeSelectMenu);
document.addEventListener('scroll', event => {if(activeSelect && !activeSelect.menu.contains(event.target))closeSelectMenu();}, true);
