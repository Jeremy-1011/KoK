const socket = io();

// ── DOM refs ──────────────────────────────────────────────────
const form              = document.getElementById('form');
const input             = document.getElementById('input');
const messagesEl        = document.getElementById('messages');
const channelContainer  = document.getElementById('channels');
const dmListEl          = document.getElementById('dm-list');
const onlineListEl      = document.getElementById('online-list');
const onlineCountEl     = document.getElementById('online-count');
const chatHeader        = document.getElementById('chat-header');
const pfpInput          = document.getElementById('pfpInput');
const fileInput         = document.getElementById('fileInput');
const filePreview       = document.getElementById('file-preview');
const filePreviewName   = document.getElementById('file-preview-name');
const clearFileBtn      = document.getElementById('clearFile');
const typingIndicator   = document.getElementById('typing-indicator');
const emojiPicker       = document.getElementById('emoji-picker');

// ── State ─────────────────────────────────────────────────────
let username       = prompt('Enter your username') || 'Anonymous';
let pfp            = '/default-avatar.svg';
let currentChannel = 'general';
let currentDm      = null;   // username of DM partner, or null
let pendingFile    = null;
let activeReactMsgId = null;
let activeReactIsDm  = false;
const typingUsers  = new Set();
let typingTimeout;
const unreadDms    = {};     // { username: count }

// ── Register with server ──────────────────────────────────────
socket.emit('register', { username, pfp });

// ── Profile picture ───────────────────────────────────────────
pfpInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res  = await fetch('/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.path) pfp = data.path;
});

// ── File attachment ───────────────────────────────────────────
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  pendingFile = file;
  filePreviewName.textContent = file.name;
  filePreview.classList.remove('hidden');
});
clearFileBtn.addEventListener('click', () => {
  pendingFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
});

// ── Render message ────────────────────────────────────────────
function buildReactionsHTML(reactions, msgId, isDm) {
  if (!reactions || Object.keys(reactions).length === 0) return '';
  return '<div class="reactions">' +
    Object.entries(reactions).map(([emoji, users]) => {
      if (!users.length) return '';
      const mine = users.includes(username) ? ' mine' : '';
      return `<span class="reaction-pill${mine}" data-msgid="${msgId}" data-emoji="${emoji}" data-isdm="${isDm}">${emoji} ${users.length}</span>`;
    }).join('') +
  '</div>';
}

function addMessage(msg, isDm = false) {
  const item = document.createElement('div');
  item.classList.add('message');
  item.dataset.msgid = msg.id;

  let fileHTML = '';
  if (msg.file) {
    if (msg.file.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      fileHTML = `<img src="${msg.file}" class="attachment" onclick="window.open('${msg.file}')" />`;
    } else {
      const icon = msg.file.match(/\.pdf$/i) ? '📄' : msg.file.match(/\.zip$/i) ? '🗜' : '📎';
      const name = msg.fileName || msg.file.split('/').pop();
      fileHTML = `<a href="${msg.file}" target="_blank" class="file-link">${icon} ${name}</a>`;
    }
  }

  item.innerHTML = `
    <img class="pfp" src="${msg.pfp || '/default-avatar.svg'}" onerror="this.src='/default-avatar.svg'" />
    <div class="message-content">
      <div class="msg-header">
        <span class="username">${msg.username}</span>
        <span class="time">${msg.time}</span>
      </div>
      <div class="text">${msg.text || ''}</div>
      ${fileHTML}
      ${buildReactionsHTML(msg.reactions, msg.id, isDm)}
    </div>
    <button class="react-btn" data-msgid="${msg.id}" data-isdm="${isDm}">😊</button>
  `;

  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateReactions(msgId, reactions) {
  const msgEl = messagesEl.querySelector(`[data-msgid="${msgId}"]`);
  if (!msgEl) return;
  const existing = msgEl.querySelector('.reactions');
  const isDm = msgEl.querySelector('.react-btn')?.dataset.isdm === 'true';
  const html = buildReactionsHTML(reactions, msgId, isDm);
  if (existing) existing.outerHTML = html;
  else msgEl.querySelector('.message-content').insertAdjacentHTML('beforeend', html);
}

// ── Socket events ─────────────────────────────────────────────
socket.on('init', ({ channels, messages, onlineUsers }) => {
  channelContainer.innerHTML = '';
  channels.forEach(ch => addChannelToSidebar(ch, ch === currentChannel));
  messagesEl.innerHTML = '';
  messages.forEach(m => addMessage(m));
  renderOnlineUsers(onlineUsers);
});

socket.on('load messages', messages => {
  messagesEl.innerHTML = '';
  messages.forEach(m => addMessage(m));
});

socket.on('chat message', msg => {
  if (currentDm === null) addMessage(msg);
});

socket.on('reaction update', ({ msgId, reactions }) => updateReactions(msgId, reactions));

// ── Online users ──────────────────────────────────────────────
socket.on('online users', users => renderOnlineUsers(users));

function renderOnlineUsers(users) {
  onlineCountEl.textContent = users.length;
  onlineListEl.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.classList.add('online-user');
    div.dataset.username = u.username;
    div.innerHTML = `
      <span class="online-dot"></span>
      <img class="online-pfp" src="${u.pfp || '/default-avatar.svg'}" onerror="this.src='/default-avatar.svg'" />
      <span>${u.username}</span>
    `;
    div.addEventListener('click', () => openDm(u.username));
    onlineListEl.appendChild(div);
  });
}

// ── DMs ───────────────────────────────────────────────────────
function openDm(toUser) {
  if (toUser === username) return; // can't DM yourself
  currentDm = toUser;
  currentChannel = null;

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const existing = dmListEl.querySelector(`[data-dm="${toUser}"]`);
  if (existing) {
    existing.classList.add('active');
    existing.querySelector('.dm-badge')?.remove();
    unreadDms[toUser] = 0;
  } else {
    addDmToSidebar(toUser, true);
  }

  chatHeader.textContent = `@ ${toUser}`;
  input.placeholder = `Message ${toUser}`;
  messagesEl.innerHTML = '';
  typingUsers.clear();
  renderTyping();
  socket.emit('open dm', toUser);
}

function addDmToSidebar(toUser, active = false) {
  if (dmListEl.querySelector(`[data-dm="${toUser}"]`)) return;
  const div = document.createElement('div');
  div.classList.add('nav-item', 'dm-item');
  div.dataset.dm = toUser;
  if (active) div.classList.add('active');
  div.innerHTML = `@ ${toUser}`;
  div.addEventListener('click', () => openDm(toUser));
  dmListEl.appendChild(div);
}

socket.on('load dm', ({ with: withUser, messages }) => {
  messagesEl.innerHTML = '';
  messages.forEach(m => addMessage(m, true));
});

socket.on('dm message', ({ from, to, msg }) => {
  const partner = from === username ? to : from;
  addDmToSidebar(partner);

  if (currentDm === partner) {
    addMessage(msg, true);
  } else {
    // Show unread badge
    unreadDms[partner] = (unreadDms[partner] || 0) + 1;
    const dmEl = dmListEl.querySelector(`[data-dm="${partner}"]`);
    if (dmEl) {
      let badge = dmEl.querySelector('.dm-badge');
      if (!badge) { badge = document.createElement('span'); badge.classList.add('dm-badge'); dmEl.appendChild(badge); }
      badge.textContent = unreadDms[partner];
    }
  }
});

// ── Send message ──────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text && !pendingFile) return;

  socket.emit('stop typing', { username, channel: currentChannel });
  clearTimeout(typingTimeout);

  let filePath = null, fileName = null;
  if (pendingFile) {
    const fd = new FormData();
    fd.append('file', pendingFile);
    const res  = await fetch('/upload-any', { method: 'POST', body: fd });
    const data = await res.json();
    filePath = data.path;
    fileName = pendingFile.name;
    pendingFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
  }

  const msg = { username, pfp, text, file: filePath, fileName, time: new Date().toLocaleTimeString() };

  if (currentDm) {
    socket.emit('dm', { to: currentDm, msg });
    addMessage({ ...msg, reactions: {} }, true);
  } else {
    socket.emit('chat message', msg);
  }
  input.value = '';
});

// ── Typing ────────────────────────────────────────────────────
input.addEventListener('input', () => {
  if (!currentDm) {
    socket.emit('typing', { username, channel: currentChannel });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stop typing', { username, channel: currentChannel }), 1500);
  }
});
socket.on('typing', ({ username: who }) => { typingUsers.add(who); renderTyping(); });
socket.on('stop typing', ({ username: who }) => { typingUsers.delete(who); renderTyping(); });
function renderTyping() {
  if (!typingUsers.size) { typingIndicator.innerHTML = ''; return; }
  const names = [...typingUsers].join(', ');
  typingIndicator.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>&nbsp;<strong>${names}</strong> ${typingUsers.size > 1 ? 'are' : 'is'} typing…`;
}

// ── Emoji reactions ───────────────────────────────────────────
messagesEl.addEventListener('click', e => {
  // React button
  const reactBtn = e.target.closest('.react-btn');
  if (reactBtn) {
    activeReactMsgId = reactBtn.dataset.msgid;
    activeReactIsDm  = reactBtn.dataset.isdm === 'true';
    const rect = reactBtn.getBoundingClientRect();
    emojiPicker.style.top  = (rect.top - 52) + 'px';
    emojiPicker.style.left = rect.left + 'px';
    emojiPicker.classList.remove('hidden');
    e.stopPropagation();
    return;
  }
  // Reaction pill toggle
  const pill = e.target.closest('.reaction-pill');
  if (pill) {
    socket.emit('react', {
      msgId:   pill.dataset.msgid,
      emoji:   pill.dataset.emoji,
      channel: currentChannel,
      isDm:    pill.dataset.isdm === 'true',
      dmWith:  currentDm
    });
    return;
  }
});

emojiPicker.addEventListener('click', e => {
  const opt = e.target.closest('.emoji-opt');
  if (!opt || !activeReactMsgId) return;
  socket.emit('react', {
    msgId:   activeReactMsgId,
    emoji:   opt.dataset.emoji,
    channel: currentChannel,
    isDm:    activeReactIsDm,
    dmWith:  currentDm
  });
  emojiPicker.classList.add('hidden');
});

document.addEventListener('click', () => emojiPicker.classList.add('hidden'));

// ── Channel management ────────────────────────────────────────
channelContainer.addEventListener('click', e => {
  const el = e.target.closest('.nav-item');
  if (!el || !el.dataset.channel) return;
  const ch = el.dataset.channel;
  if (ch === currentChannel && !currentDm) return;
  currentDm = null;
  currentChannel = ch;
  typingUsers.clear();
  renderTyping();
  document.querySelectorAll('.nav-item').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  chatHeader.textContent = `# ${ch}`;
  input.placeholder = `Message #${ch}`;
  socket.emit('switch channel', ch);
});

document.getElementById('addChannel').addEventListener('click', async () => {
  const name = prompt('Channel name:');
  if (!name) return;
  const res = await fetch('/channel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'add', channel:name }) });
  const data = await res.json();
  if (data.error) alert(data.error);
});

document.getElementById('deleteChannel').addEventListener('click', async () => {
  const name = prompt('Delete channel name:');
  if (!name) return;
  const res = await fetch('/channel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'delete', channel:name }) });
  const data = await res.json();
  if (data.error) alert(data.error);
});

function addChannelToSidebar(ch, active = false) {
  const div = document.createElement('div');
  div.classList.add('nav-item', 'channel');
  if (active) div.classList.add('active');
  div.dataset.channel = ch;
  div.textContent = `# ${ch}`;
  channelContainer.appendChild(div);
}

socket.on('channel added', ch => addChannelToSidebar(ch));
socket.on('channel deleted', ch => {
  const div = document.querySelector(`.channel[data-channel="${ch}"]`);
  if (div) {
    div.remove();
    if (currentChannel === ch) {
      currentDm = null;
      currentChannel = 'general';
      chatHeader.textContent = '# general';
      input.placeholder = 'Message #general';
      socket.emit('switch channel', 'general');
      document.querySelector('.channel[data-channel="general"]')?.classList.add('active');
    }
  }
});
