// ============================================================
// STUDIUM — Study Notes App
// TypeScript-compatible JS (ES2020+)
// ============================================================

"use strict";

// ── Types ────────────────────────────────────────────────────
/** @typedef {{ id: string; name: string; notes: Note[] }} Subject */
/** @typedef {{ id: string; subjectId: string; name: string; content: string; updatedAt: string }} Note */

// ── State ────────────────────────────────────────────────────
/** @type {{ subjects: Subject[]; activeNoteId: string|null; activeSubjectId: string|null; isGithubUser: boolean; githubToken: string|null; githubUser: any; githubRepo: string; githubBranch: string; volume: number; unsaved: boolean; previewMode: boolean }} */
const State = {
  subjects: [],
  activeNoteId: null,
  activeSubjectId: null,
  isGithubUser: false,
  githubToken: null,
  githubUser: null,
  githubRepo: 'studium-notes',
  githubBranch: 'main',
  volume: 60,
  unsaved: false,
  previewMode: false,
};

// ── Audio Engine (Creamy Switch Mod) ─────────────────────────
class KeyboardSound {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.volume = 0.6;
  }

  _getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }

  /** Synthesise a creamy, lubed mechanical click with deep thock profile */
  click() {
    if (this.volume === 0) return;
    try {
      const ctx = this._getCtx();
      const now = ctx.currentTime;

      // Soft noise burst for that deep, lubed cream texture
      const bufLen = ctx.sampleRate * 0.06;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 4);
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Low-center Bandpass filter for deep acoustic signature
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 650 + Math.random() * 250;
      bp.Q.value = 1.2;

      const gain = ctx.createGain();
      // Smooth attack curve
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.volume * (0.85 + Math.random() * 0.2), now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);

    } catch (e) { /* silent fail */ }
  }

  setVolume(v) { this.volume = v / 100; }
}

const kb = new KeyboardSound();

// ── Persistence ──────────────────────────────────────────────
function saveLocal() {
  localStorage.setItem('studium_subjects', JSON.stringify(State.subjects));
  localStorage.setItem('studium_github_token', State.githubToken || '');
  localStorage.setItem('studium_github_repo', State.githubRepo);
  localStorage.setItem('studium_github_branch', State.githubBranch);
  localStorage.setItem('studium_volume', String(State.volume));
}

function loadLocal() {
  try {
    const raw = localStorage.getItem('studium_subjects');
    if (raw) State.subjects = JSON.parse(raw);
    const token = localStorage.getItem('studium_github_token');
    if (token) State.githubToken = token;
    const repo = localStorage.getItem('studium_github_repo');
    if (repo) State.githubRepo = repo;
    const branch = localStorage.getItem('studium_github_branch');
    if (branch) State.githubBranch = branch;
    const vol = localStorage.getItem('studium_volume');
    if (vol) State.volume = Number(vol);
  } catch (e) {}
}

// ── UUID ─────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── DOM helpers ──────────────────────────────────────────────
/** @param {string} sel @returns {HTMLElement} */
const $ = (sel) => document.querySelector(sel);
/** @param {string} id @returns {HTMLElement} */
const $id = (id) => document.getElementById(id);

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const container = $id('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ── Modal ────────────────────────────────────────────────────
function openModal(title, bodyHTML, onClose) {
  $id('modal-title').textContent = title;
  $id('modal-body').innerHTML = bodyHTML;
  $id('modal-overlay').classList.remove('hidden');
  $id('modal-close').onclick = () => {
    closeModal();
    if (onClose) onClose();
  };
}

function closeModal() {
  $id('modal-overlay').classList.add('hidden');
  $id('modal-body').innerHTML = '';
}

// ── Context Menu ─────────────────────────────────────────────
/** @type {HTMLElement|null} */
let ctxMenu = null;

function openContextMenu(x, y, items) {
  closeContextMenu();
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'context-menu';
  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      ctxMenu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = `context-menu-item${item.danger ? ' danger' : ''}`;
    el.innerHTML = `<span>${item.icon || ''}</span>${item.label}`;
    el.onclick = () => { closeContextMenu(); item.action(); };
    ctxMenu.appendChild(el);
  });
  ctxMenu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  ctxMenu.style.top = Math.min(y, window.innerHeight - ctxMenu.children.length * 34) + 'px';
  document.body.appendChild(ctxMenu);
}

function closeContextMenu() {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}

// ── File Tree Render (Vertical Flow) ─────────────────────────
function renderTree() {
  const tree = $id('file-tree');
  tree.innerHTML = '';
  let total = 0;

  State.subjects.forEach(subject => {
    const count = subject.notes.length;
    total += count;

    const subjectEl = document.createElement('div');
    subjectEl.className = 'subject-item';
    subjectEl.dataset.id = subject.id;

    const isOpen = subject._open !== false;

    subjectEl.innerHTML = `
      <button class="subject-toggle" data-subject="${subject.id}">
        <span class="subject-icon ${isOpen ? 'open' : ''}">▶</span>
        <span class="subject-name">${escHtml(subject.name)}</span>
        <span class="subject-count">${count}</span>
      </button>`;

    const filesEl = document.createElement('div');
    filesEl.className = 'subject-files';
    if (!isOpen) filesEl.style.display = 'none';

    subject.notes.forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = `note-item${note.id === State.activeNoteId ? ' active' : ''}`;
      noteEl.dataset.noteId = note.id;
      noteEl.dataset.subjectId = subject.id;
      noteEl.innerHTML = `
        <span class="note-icon">◆</span>
        <span class="note-name">${escHtml(note.name)}</span>
        <span class="note-actions">
          <button data-action="rename" title="Renomear">✎</button>
          <button data-action="delete" title="Excluir">✕</button>
        </span>`;

      noteEl.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'rename') { renameNote(note.id, subject.id); return; }
        if (action === 'delete') { deleteNote(note.id, subject.id); return; }
        openNote(note.id, subject.id);
      });

      noteEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Abrir', icon: '◆', action: () => openNote(note.id, subject.id) },
          { label: 'Renomear', icon: '✎', action: () => renameNote(note.id, subject.id) },
          'sep',
          { label: 'Excluir', icon: '✕', danger: true, action: () => deleteNote(note.id, subject.id) },
        ]);
      });

      filesEl.appendChild(noteEl);
    });

    subjectEl.appendChild(filesEl);

    // Subject toggle
    subjectEl.querySelector('.subject-toggle').addEventListener('click', () => {
      subject._open = !isOpen;
      renderTree();
    });

    // Subject right-click
    subjectEl.querySelector('.subject-toggle').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [
        { label: 'Nova anotação', icon: '+', action: () => newNote(subject.id) },
        { label: 'Renomear matéria', icon: '✎', action: () => renameSubject(subject.id) },
        'sep',
        { label: 'Excluir matéria', icon: '✕', danger: true, action: () => deleteSubject(subject.id) },
      ]);
    });

    tree.appendChild(subjectEl);
  });

  $id('notes-count').textContent = `${total} arquivo${total !== 1 ? 's' : ''}`;
}

// ── Editor ───────────────────────────────────────────────────
/** @type {HTMLTextAreaElement} */
const editor = $id('editor');

function openNote(noteId, subjectId) {
  if (State.activeNoteId && State.unsaved) saveCurrentNote();

  const subject = State.subjects.find(s => s.id === subjectId);
  const note = subject?.notes.find(n => n.id === noteId);
  if (!note) return;

  State.activeNoteId = noteId;
  State.activeSubjectId = subjectId;

  $id('empty-state').classList.add('hidden');
  editor.classList.remove('hidden');
  $id('preview-pane').classList.add('hidden');
  State.previewMode = false;
  $id('btn-toggle-preview').classList.remove('active');

  editor.value = note.content;
  editor.focus();

  $id('current-file-name').textContent = `${subject.name} / ${note.name}`;
  setUnsaved(false);
  updateWordCount();
  updateCursor();

  renderTree();
}

function saveCurrentNote() {
  if (!State.activeNoteId) return;
  const subject = State.subjects.find(s => s.id === State.activeSubjectId);
  const note = subject?.notes.find(n => n.id === State.activeNoteId);
  if (!note) return;
  note.content = editor.value;
  note.updatedAt = new Date().toISOString();
  saveLocal();
  setUnsaved(false);
}

function setUnsaved(val) {
  State.unsaved = val;
  $id('unsaved-dot').style.display = val ? 'inline' : 'none';
}

// ── CRUD ─────────────────────────────────────────────────────
function newSubject(name) {
  const subject = { id: uid(), name, notes: [], _open: true };
  State.subjects.push(subject);
  saveLocal();
  renderTree();
  toast(`Matéria "${name}" criada`, 'success');
}

function newNote(subjectId, name) {
  const subject = State.subjects.find(s => s.id === subjectId);
  if (!subject) return;
  const note = {
    id: uid(),
    subjectId,
    name: name || 'nova anotação',
    content: '',
    updatedAt: new Date().toISOString(),
  };
  subject.notes.push(note);
  saveLocal();
  renderTree();
  openNote(note.id, subjectId);
}

function renameNote(noteId, subjectId) {
  const subject = State.subjects.find(s => s.id === subjectId);
  const note = subject?.notes.find(n => n.id === noteId);
  if (!note) return;

  openModal('RENOMEAR ARQUIVO', `
    <label>Nome da anotação<input id="rename-input" value="${escHtml(note.name)}" /></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" id="rename-confirm">Renomear</button>
    </div>`);

  const input = $id('rename-input');
  input.select();
  $id('rename-confirm').onclick = () => {
    const val = input.value.trim();
    if (!val) return;
    note.name = val;
    saveLocal();
    renderTree();
    $id('current-file-name').textContent = `${subject.name} / ${note.name}`;
    closeModal();
    toast('Arquivo renomeado', 'success');
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') $id('rename-confirm').click(); });
}

function deleteNote(noteId, subjectId) {
  const subject = State.subjects.find(s => s.id === subjectId);
  if (!subject) return;
  if (!confirm(`Excluir "${subject.notes.find(n=>n.id===noteId)?.name}"?`)) return;
  subject.notes = subject.notes.filter(n => n.id !== noteId);
  if (State.activeNoteId === noteId) {
    State.activeNoteId = null;
    editor.classList.add('hidden');
    $id('empty-state').classList.remove('hidden');
    $id('current-file-name').textContent = 'sem arquivo';
    setUnsaved(false);
  }
  saveLocal();
  renderTree();
  toast('Arquivo excluído', 'info');
}

// ── GitHub API / Commit (Separated Paths Flow) ────────────────
async function githubFetch(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      'Authorization': `token ${State.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub error ${res.status}`);
  }
  return res.json();
}

async function loadGithubUser() {
  try {
    const user = await githubFetch('/user');
    State.githubUser = user;
    State.isGithubUser = true;
    $id('user-avatar').src = user.avatar_url;
    $id('user-name').textContent = user.login;
    $id('user-info').classList.remove('hidden');
    $id('btn-commit').style.display = 'flex';
    $id('status-sync').textContent = 'github';
    toast(`Olá, ${user.login}!`, 'success');
  } catch (e) {
    toast('Erro ao carregar usuário GitHub: ' + e.message, 'error');
    State.githubToken = null;
  }
}

async function ensureRepo() {
  try {
    await githubFetch(`/repos/${State.githubUser.login}/${State.githubRepo}`);
  } catch {
    await githubFetch('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: State.githubRepo,
        description: 'Minhas anotações de estudos — STUDIUM',
        private: true,
        auto_init: true,
      }),
    });
    toast(`Repositório "${State.githubRepo}" criado!`, 'success');
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function commitNote(note, subject) {
  if (!State.githubToken || !State.githubUser) {
    toast('Configure o GitHub primeiro', 'warning');
    return;
  }

  // Ask for repo dynamically before pushing
  const targetRepo = prompt("Em qual repositório deseja realizar o commit?", State.githubRepo);
  if (!targetRepo) {
    toast('Commit cancelado', 'info');
    return;
  }
  State.githubRepo = targetRepo.trim();
  saveLocal();

  // Keeps the folders separated identical to the app layout (subject/file.md)
  const path = `${slugify(subject.name)}/${slugify(note.name)}.md`;
  const content = btoa(unescape(encodeURIComponent(note.content)));

  try {
    toast('Verificando repositório...', 'info', 1500);
    await ensureRepo();

    let sha;
    try {
      const existing = await githubFetch(
        `/repos/${State.githubUser.login}/${State.githubRepo}/contents/${path}?ref=${State.githubBranch}`
      );
      sha = existing.sha;
    } catch { /* new file */ }

    const body = {
      message: `✏️ update: ${subject.name}/${note.name} [${new Date().toLocaleString('pt-BR')}]`,
      content,
      branch: State.githubBranch,
    };
    if (sha) body.sha = sha;

    await githubFetch(
      `/repos/${State.githubUser.login}/${State.githubRepo}/contents/${path}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );

    toast(`Commit realizado em ${State.githubRepo}: ${path}`, 'success');
    $id('status-sync').textContent = `git:${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (e) {
    toast('Erro no commit: ' + e.message, 'error');
  }
}

async function commitAll() {
  if (!State.githubToken || !State.githubUser) {
    showGithubConfig();
    return;
  }
  if (State.unsaved) saveCurrentNote();
  
  const targetRepo = prompt("Em qual repositório deseja commitar todos os arquivos?", State.githubRepo);
  if (!targetRepo) {
    toast('Sincronização cancelada', 'info');
    return;
  }
  State.githubRepo = targetRepo.trim();
  saveLocal();

  let count = 0;
  for (const subject of State.subjects) {
    for (const note of subject.notes) {
      if (note.content.trim()) {
        const path = `${slugify(subject.name)}/${slugify(note.name)}.md`;
        const content = btoa(unescape(encodeURIComponent(note.content)));
        try {
          await ensureRepo();
          let sha;
          try {
            const existing = await githubFetch(`/repos/${State.githubUser.login}/${State.githubRepo}/contents/${path}?ref=${State.githubBranch}`);
            sha = existing.sha;
          } catch {}
          const body = {
            message: `✏️ bulk-update: ${subject.name}/${note.name}`,
            content,
            branch: State.githubBranch
          };
          if (sha) body.sha = sha;
          await githubFetch(`/repos/${State.githubUser.login}/${State.githubRepo}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
          count++;
        } catch (e) { console.error(e); }
      }
    }
  }
  toast(`${count} arquivo(s) sincronizado(s) em ${State.githubRepo}`, 'success');
}

// ── Export / Sync / Modals (Rest of features) ────────────────
function renameSubject(subjectId) {
  const subject = State.subjects.find(s => s.id === subjectId);
  if (!subject) return;

  openModal('RENOMEAR MATÉRIA', `
    <label>Nome da matéria<input id="rename-sub-input" value="${escHtml(subject.name)}" /></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" id="rename-sub-confirm">Renomear</button>
    </div>`);

  const input = $id('rename-sub-input');
  input.select();
  $id('rename-sub-confirm').onclick = () => {
    const val = input.value.trim();
    if (!val) return;
    subject.name = val;
    saveLocal();
    renderTree();
    closeModal();
    toast('Matéria renomeada', 'success');
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') $id('rename-sub-confirm').click(); });
}

function deleteSubject(subjectId) {
  const subject = State.subjects.find(s => s.id === subjectId);
  if (!subject) return;
  if (!confirm(`Excluir matéria "${subject.name}" e todas as suas anotações?`)) return;
  if (subject.notes.some(n => n.id === State.activeNoteId)) {
    State.activeNoteId = null;
    editor.classList.add('hidden');
    $id('empty-state').classList.remove('hidden');
    $id('current-file-name').textContent = 'sem arquivo';
  }
  State.subjects = State.subjects.filter(s => s.id !== subjectId);
  saveLocal();
  renderTree();
  toast(`Matéria excluída`, 'info');
}

function insertMarkdown(cmd) {
  const ta = editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  let before = '', after = '', result = '';

  switch (cmd) {
    case 'bold':   before = '**'; after = '**'; break;
    case 'italic': before = '*';  after = '*';  break;
    case 'code':   before = '`';  after = '`';  break;
    case 'h1':     before = '# '; after = '';   break;
    case 'h2':     before = '## '; after = '';  break;
    case 'quote':  before = '> '; after = '';   break;
    case 'list':   before = '- '; after = '';   break;
  }

  result = before + (sel || 'texto') + after;
  ta.setRangeText(result, start, end, 'select');
  ta.focus();
  setUnsaved(true);
}

function simpleMarkdown(md) {
  let html = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

    if (html.includes('<li>')) {
      html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    }
    return html;
}

function updateWordCount() {
  const text = editor.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  $id('word-count').textContent = `${words} palavra${words !== 1 ? 's' : ''}`;
}

function updateCursor() {
  const text = editor.value.slice(0, editor.selectionStart);
  const lines = text.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  $id('status-cursor').textContent = `Ln ${line}, Col ${col}`;
}

function downloadTxt(note, subject) {
  if (!note) return;
  const blob = new Blob([note.content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${slugify(subject.name)}_${slugify(note.name)}.txt`);
}

function downloadDocx(note, subject) {
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier New;}}\\f0\\fs22{\\b ${note.name}}\\par\\par${note.content.replace(/\n/g, '\\par\n').replace(/[{}\\]/g, '\\$&')}`;
  const blob = new Blob([rtf], { type: 'application/rtf' });
  triggerDownload(blob, `${slugify(subject.name)}_${slugify(note.name)}.rtf`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast('Arquivo baixado com sucesso', 'success');
}

async function saveToGDrive(note, subject) {
  toast('Abrindo Google Drive...', 'info');
  await navigator.clipboard.writeText(note.content).catch(() => {});
  window.open('https://drive.google.com/drive/my-drive', '_blank');
  toast('Copiado! Crie e cole num novo arquivo no Drive.', 'info', 4000);
}

function showSaveOptions() {
  if (State.unsaved) saveCurrentNote();
  const subject = State.subjects.find(s => s.id === State.activeSubjectId);
  const note = subject?.notes.find(n => n.id === State.activeNoteId);

  if (!note) { toast('Nenhum arquivo aberto', 'warning'); return; }

  openModal('SALVAR ARQUIVO', `
    <div class="export-options">
      <button class="export-btn" id="exp-txt">📄 Salvar como .txt</button>
      <button class="export-btn" id="exp-rtf">📝 Salvar como .rtf (Word)</button>
      <button class="export-btn" id="exp-drive">☁️ Salvar no Google Drive</button>
      ${State.isGithubUser ? '<button class="export-btn" id="exp-github">🐙 Commit no GitHub</button>' : ''}
    </div>`);

  $id('exp-txt').onclick = () => { downloadTxt(note, subject); closeModal(); };
  $id('exp-rtf').onclick = () => { downloadDocx(note, subject); closeModal(); };
  $id('exp-drive').onclick = () => { saveToGDrive(note, subject); closeModal(); };
  if (State.isGithubUser) {
    $id('exp-github').onclick = () => { commitNote(note, subject); closeModal(); };
  }
}

function showGithubConfig() {
  openModal('CONFIGURAR GITHUB', `
    <div class="github-form">
      <label>Personal Access Token (PAT)
        <input id="gh-token" type="password" placeholder="ghp_..." value="${State.githubToken || ''}" />
      </label>
      <label>Repositório Padrão
        <input id="gh-repo" value="${State.githubRepo}" />
      </label>
      <label>Branch
        <input id="gh-branch" value="${State.githubBranch}" />
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="gh-connect">Conectar</button>
      </div>
    </div>`);

  $id('gh-connect').onclick = async () => {
    const token = $id('gh-token').value.trim();
    if (!token) { toast('Token obrigatório', 'error'); return; }
    State.githubToken = token;
    State.githubRepo = $id('gh-repo').value.trim() || 'studium-notes';
    State.githubBranch = $id('gh-branch').value.trim() || 'main';
    saveLocal();
    closeModal();
    await loadGithubUser();
  };
}

function initResize() {
  const handle = $id('resize-handle');
  const sidebar = $('#sidebar');
  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    sidebar.style.width = Math.max(140, Math.min(420, startW + e.clientX - startX)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function startClock() {
  const tick = () => { $id('status-time').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 10000);
}

function initShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 's': e.preventDefault(); if (State.activeNoteId) { saveCurrentNote(); toast('Salvo', 'success', 1200); } break;
        case 'b': if ($id('editor') === document.activeElement) { e.preventDefault(); insertMarkdown('bold'); } break;
        case 'i': if ($id('editor') === document.activeElement) { e.preventDefault(); insertMarkdown('italic'); } break;
        case 'p': e.preventDefault(); togglePreview(); break;
      }
    }
  });
}

function togglePreview() {
  State.previewMode = !State.previewMode;
  if (State.previewMode) {
    if (State.unsaved) saveCurrentNote();
    const note = State.subjects.find(s => s.id === State.activeSubjectId)?.notes.find(n => n.id === State.activeNoteId);
    if (!note) return;
    $id('preview-pane').innerHTML = '<p>' + simpleMarkdown(note.content) + '</p>';
    editor.classList.add('hidden');
    $id('preview-pane').classList.remove('hidden');
    $id('btn-toggle-preview').classList.add('active');
    $id('status-mode').textContent = 'PREVIEW';
  } else {
    editor.classList.remove('hidden');
    $id('preview-pane').classList.add('hidden');
    $id('btn-toggle-preview').classList.remove('active');
    $id('status-mode').textContent = 'EDIÇÃO';
  }
}

function escHtml(str) { return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function slugify(str) { return (str || 'arquivo').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function showApp() {
  $id('auth-screen').style.display = 'none';
  $id('app').classList.remove('hidden');
  renderTree(); startClock(); initResize(); initShortcuts();

  if (State.subjects.length === 0) {
    const s = { id: uid(), name: 'Exemplo', notes: [], _open: true };
    const n = {
      id: uid(), subjectId: s.id, name: 'Bem-vindo',
      content: `# Bem-vindo ao STUDIUM\n\nSeu espaço de anotações.\n\n- Crie pastas com **+DIR**\n- Crie notas com **+FILE**`,
      updatedAt: new Date().toISOString(),
    };
    s.notes.push(n); State.subjects.push(s); saveLocal(); renderTree();
    setTimeout(() => openNote(n.id, s.id), 100);
  }
}

// ── Main Init Block ──────────────────────────────────────────
function init() {
  loadLocal();

  const volSlider = $id('volume-slider');
  volSlider.value = State.volume;
  $id('volume-display').textContent = State.volume;
  kb.setVolume(State.volume);

  volSlider.addEventListener('input', () => {
    State.volume = Number(volSlider.value);
    $id('volume-display').textContent = State.volume;
    kb.setVolume(State.volume);
    kb.click();
    saveLocal();
  });

  // Editor Keydown - HOLDS AND KEY REPEATS ARE IGNORED HERE
  editor.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Prevent repetitive machine-gun loop when keys are held down
    kb.click();

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText('  ', start, end, 'end');
      setUnsaved(true);
    }
  });

  editor.addEventListener('input', () => { setUnsaved(true); updateWordCount(); });
  editor.addEventListener('keyup', updateCursor);
  editor.addEventListener('click', updateCursor);

  setInterval(() => { if (State.activeNoteId && State.unsaved) saveCurrentNote(); }, 30000);

  $id('btn-github-login').addEventListener('click', () => { showApp(); setTimeout(showGithubConfig, 400); });
  $id('btn-local').addEventListener('click', showApp);

  document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => insertMarkdown(btn.dataset.cmd));
  });

  $id('btn-toggle-preview').addEventListener('click', togglePreview);

  $id('btn-new-subject').addEventListener('click', () => {
    openModal('NOVA MATÉRIA', `<label>Nome da matéria<input id="new-sub-input" placeholder="ex: Matemática..." /></label><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" id="new-sub-confirm">Criar</button></div>`);
    const input = $id('new-sub-input'); input.focus();
    $id('new-sub-confirm').onclick = () => { const val = input.value.trim(); if (!val) return; newSubject(val); closeModal(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') $id('new-sub-confirm').click(); });
  });

  $id('btn-new-note').addEventListener('click', () => {
    if (State.subjects.length === 0) { toast('Crie uma matéria primeiro', 'warning'); return; }
    const opts = State.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    openModal('NOVA ANOTAÇÃO', `<label>Matéria<select id="new-note-subject">${opts}</select></label><label>Nome da anotação<input id="new-note-input" placeholder="Aula 01..." /></label><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" id="new-note-confirm">Criar</button></div>`);
    if (State.activeSubjectId) $id('new-note-subject').value = State.activeSubjectId;
    const input = $id('new-note-input'); input.focus();
    $id('new-note-confirm').onclick = () => { const name = input.value.trim(); const subjectId = $id('new-note-subject').value; if (!name) return; newNote(subjectId, name); closeModal(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') $id('new-note-confirm').click(); });
  });

  $id('btn-save-local').addEventListener('click', showSaveOptions);
  $id('btn-commit').addEventListener('click', commitAll);
  $id('btn-gdrive').addEventListener('click', () => {
    const subject = State.subjects.find(s => s.id === State.activeSubjectId);
    const note = subject?.notes.find(n => n.id === State.activeNoteId);
    if (note) saveToGDrive(note, subject); else toast('Nenhum arquivo aberto', 'warning');
  });

  $id('btn-logout').addEventListener('click', () => { if (confirm('Deseja sair do sistema?')) location.reload(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.context-menu')) closeContextMenu(); });

  if (State.githubToken) loadGithubUser().catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
