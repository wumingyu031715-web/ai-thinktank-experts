export const STORAGE_KEY = 'ai-thinktank-experts-v1';
export const detailKeys = { policy: 'policies', opinion: 'opinions', paper: 'papers', project: 'projects', book: 'books', patent: 'patents', otherAchievement: 'otherAchievements' };
export const clone = value => structuredClone(value);
export function emptyDetail() {
  return { bio: [], education: [], educationEn: [], work: [], workEn: [], social: [], honors: [], researchTags: [], candidateTags: [], policies: [], opinions: [], papers: [], projects: [], books: [], patents: [], otherAchievements: [], fields: [], collaborators: [], institutions: [], stats: { h: 0, g: 0, s: 0, d: 0, a: 0 } };
}
export function filterExperts(experts, filters = {}) {
  const contains = (value, search) => String(value || '').toLocaleLowerCase().includes(String(search || '').trim().toLocaleLowerCase());
  const atLeast = (count, minimum) => minimum === undefined || minimum === null || String(minimum).trim() === '' || (Number.isSafeInteger(Number(minimum)) && Number(minimum) >= 0 && Number(count) >= Number(minimum));
  return experts.filter(e => contains(e.name, filters.name) && contains(e.research, filters.research) && (!filters.rank || e.rank === filters.rank) && (!filters.status || e.status === filters.status) && contains(e.unit, filters.unit) && contains((e.department || []).join(';'), filters.department) && contains(e.title, filters.title) && (!filters.adjunct || String(e.adjunct) === filters.adjunct) && atLeast(e.papers, filters.minPapers) && atLeast(e.cites, filters.minCites));
}
export function findDuplicate(detail, entry) {
  const title = String(entry.fields[0] || '').trim().toLocaleLowerCase();
  return (detail[detailKeys[entry.type]] || []).some(row => String(row[0] || '').trim().toLocaleLowerCase() === title);
}
export function createStore(seed, storage = globalThis.localStorage) {
  const initial = () => ({ version: 1, experts: clone(seed.experts), details: clone(seed.details), history: clone(seed.history), publishedAt: null });
  let state = initial();
  let readWarning = '';
  try { const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); if (saved?.version === 1 && Array.isArray(saved.experts) && saved.details && Array.isArray(saved.history)) state = saved; } catch { readWarning = '浏览器数据无法读取，已载入示例数据。'; }
  return {
    get state() { return state; }, readWarning,
    getExpert(id) { return state.experts.find(e => e.id === id); },
    detail(id) { return state.details[id] ||= emptyDetail(); },
    save() { try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; } },
    reset() { state = initial(); this.save(); },
    upsert(expert) { const index = state.experts.findIndex(e => e.id === expert.id); if (index >= 0) state.experts[index] = expert; else state.experts.unshift(expert); return expert; },
    delete(ids) { state.experts = state.experts.filter(e => !ids.includes(e.id)); for (const id of ids) delete state.details[id]; },
    importEntries(id, entries) {
      const detail = this.detail(id); let added = 0; let skipped = 0;
      for (const entry of entries) { if (entry.enabled === false) continue; if (!entry.fields[0]?.trim() || findDuplicate(detail, entry)) { skipped++; continue; } (detail[detailKeys[entry.type]] ||= []).push(clone(entry.fields)); added++; }
      return { added, skipped };
    }
  };
}
