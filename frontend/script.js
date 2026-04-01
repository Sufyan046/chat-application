// Constants
const API_URL = '';
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

// State
let currentUser = null;
let token = localStorage.getItem('token');
let socket = null;
let currentChat = { type: 'private', id: null, name: '' };
let users = [];
let groups = [];
let messages = [];

// Elements
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const toggleAuthBtn = document.getElementById('toggle-auth');
const submitBtn = document.getElementById('submit-btn');
const emailGroup = document.getElementById('email-group');
const chatList = document.getElementById('chat-list');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const chatWindow = document.getElementById('chat-window');
const emptyState = document.getElementById('empty-state');
const chatTitle = document.getElementById('chat-title');
const chatStatus = document.getElementById('chat-status');
const logoutBtn = document.getElementById('logout-btn');
const addChatBtn = document.getElementById('add-chat-btn');
const newChatModal = document.getElementById('new-chat-modal');
const createGroupModal = document.getElementById('create-group-modal');
const createGroupBtn = document.getElementById('create-group-btn');
const groupForm = document.getElementById('group-form');
const tabPrivate = document.getElementById('tab-private');
const tabGroups = document.getElementById('tab-groups');

let isLogin = true;

// Initialize
lucide.createIcons();
if (token) {
    checkAuth();
}

// Auth functions
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            currentUser = await response.json();
            showApp();
        } else {
            logout();
        }
    } catch (err) {
        console.error('Auth check failed', err);
        logout();
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const email = document.getElementById('email').value;

    const endpoint = isLogin ? '/login' : '/register';
    const body = isLogin ? { username, password } : { username, password, email };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (response.ok) {
            if (isLogin) {
                token = data.access_token;
                localStorage.setItem('token', token);
                checkAuth();
            } else {
                // After register, auto login
                isLogin = true;
                handleAuth(e);
            }
        } else {
            alert(data.detail || 'Authentication failed');
        }
    } catch (err) {
        console.error('Auth error', err);
        alert('Connection error');
    }
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    if (socket) socket.close();
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
}

function showApp() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    document.getElementById('my-username').innerText = currentUser.username;
    document.getElementById('my-avatar').innerText = currentUser.username[0].toUpperCase();
    
    initWebSocket();
    loadUsers();
    loadGroups();
}

// WebSocket
function initWebSocket() {
    socket = new WebSocket(`${WS_URL}/${token}`);
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleIncomingMessage(data);
    };

    socket.onclose = () => {
        console.log('WebSocket closed');
        // Reconnect logic could be added here
    };
}

function handleIncomingMessage(data) {
    if (data.type === 'status') {
        // Update user status in the list
        const userIdx = users.findIndex(u => u.id === data.user_id);
        if (userIdx !== -1) {
            users[userIdx].is_online = data.is_online;
            if (data.last_seen) users[userIdx].last_seen = data.last_seen;
            renderChatList();
            if (currentChat.type === 'private' && currentChat.id === data.user_id) {
                updateChatHeader();
            }
        }
        return;
    }

    // It's a message
    if (
        (data.group_id && currentChat.type === 'group' && currentChat.id === data.group_id) ||
        (!data.group_id && currentChat.type === 'private' && (data.sender_id === currentChat.id || data.sender_id === currentUser.id))
    ) {
        messages.push(data);
        renderMessages();
    }
    
    // Refresh lists to show last message preview (optional)
    loadUsers();
    loadGroups();
}

// Data loading
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        users = await response.json();
        if (tabPrivate.classList.contains('bg-white')) renderChatList();
    } catch (err) {
        console.error('Failed to load users', err);
    }
}

async function loadGroups() {
    try {
        const response = await fetch(`${API_URL}/groups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        groups = await response.json();
        if (tabGroups.classList.contains('bg-white')) renderChatList();
    } catch (err) {
        console.error('Failed to load groups', err);
    }
}

async function loadMessages(type, id) {
    const endpoint = type === 'private' ? `/messages/private/${id}` : `/messages/group/${id}`;
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        messages = await response.json();
        renderMessages();
    } catch (err) {
        console.error('Failed to load messages', err);
    }
}

// UI Rendering
function renderChatList() {
    chatList.innerHTML = '';
    const list = tabPrivate.classList.contains('bg-white') ? users.filter(u => u.id !== currentUser.id) : groups;
    
    list.forEach(item => {
        const isPrivate = !!item.username;
        const isActive = currentChat.id === item.id && currentChat.type === (isPrivate ? 'private' : 'group');
        
        const div = document.createElement('div');
        div.className = `chat-item p-4 flex items-center gap-3 cursor-pointer transition-all ${isActive ? 'chat-item-active' : ''}`;
        div.onclick = () => selectChat(isPrivate ? 'private' : 'group', item.id, isPrivate ? item.username : item.name);
        
        const avatarColor = isPrivate ? (item.is_online ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600') : 'bg-blue-100 text-blue-600';
        const initials = isPrivate ? item.username[0].toUpperCase() : item.name[0].toUpperCase();
        
        div.innerHTML = `
            <div class="relative w-12 h-12 ${avatarColor} rounded-2xl flex items-center justify-center font-bold text-lg">
                ${initials}
                ${isPrivate ? `<span class="absolute bottom-0 right-0 w-3.5 h-3.5 ${item.is_online ? 'bg-green-500' : 'bg-gray-300'} border-2 border-white rounded-full"></span>` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-0.5">
                    <h4 class="font-bold text-gray-900 truncate">${isPrivate ? item.username : item.name}</h4>
                </div>
                <p class="text-xs text-gray-500 truncate">${isPrivate ? (item.is_online ? 'Online' : 'Offline') : 'Group Chat'}</p>
            </div>
        `;
        chatList.appendChild(div);
    });
}

function selectChat(type, id, name) {
    currentChat = { type, id, name };
    emptyState.classList.add('hidden');
    chatWindow.classList.remove('hidden');
    updateChatHeader();
    renderChatList();
    loadMessages(type, id);
    newChatModal.classList.add('hidden');
}

function updateChatHeader() {
    chatTitle.innerText = currentChat.name;
    const avatar = document.getElementById('chat-avatar');
    avatar.innerText = currentChat.name[0].toUpperCase();
    
    if (currentChat.type === 'private') {
        const user = users.find(u => u.id === currentChat.id);
        if (user) {
            chatStatus.innerText = user.is_online ? 'Online' : `Last seen ${new Date(user.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            chatStatus.className = `text-sm ${user.is_online ? 'text-green-500' : 'text-gray-500'}`;
        }
    } else {
        chatStatus.innerText = 'Group';
        chatStatus.className = 'text-sm text-blue-500';
    }
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const div = document.createElement('div');
        div.className = `flex flex-col ${isMe ? 'message-sent' : 'message-received'} message-bubble`;
        
        div.innerHTML = `
            ${!isMe && currentChat.type === 'group' ? `<span class="text-[10px] font-bold text-gray-500 mb-1 ml-2 uppercase tracking-wider">${msg.sender_name || 'User'}</span>` : ''}
            <div class="bubble-content px-4 py-2.5 shadow-sm">
                <p class="text-[15px] leading-relaxed">${msg.content}</p>
            </div>
            <span class="text-[10px] text-gray-400 mt-1.5 ${isMe ? 'text-right' : 'text-left'} font-medium">${time}</span>
        `;
        messagesContainer.appendChild(div);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Event Listeners
authForm.onsubmit = handleAuth;

toggleAuthBtn.onclick = () => {
    isLogin = !isLogin;
    emailGroup.classList.toggle('hidden');
    submitBtn.innerText = isLogin ? 'Sign In' : 'Sign Up';
    toggleAuthBtn.innerText = isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In";
    document.querySelector('h1').innerText = isLogin ? 'Welcome Back' : 'Create Account';
    document.querySelector('p').innerText = isLogin ? 'Sign in to start chatting' : 'Join our community today';
};

logoutBtn.onclick = logout;

messageForm.onsubmit = (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !socket) return;

    const msg = {
        content,
        receiver_id: currentChat.type === 'private' ? currentChat.id : null,
        group_id: currentChat.type === 'group' ? currentChat.id : null
    };

    socket.send(JSON.stringify(msg));
    messageInput.value = '';
};

addChatBtn.onclick = () => {
    newChatModal.classList.remove('hidden');
    renderUsersInModal();
};

function renderUsersInModal() {
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    users.filter(u => u.id !== currentUser.id).forEach(user => {
        const div = document.createElement('div');
        div.className = 'p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer rounded-xl transition-all mx-2';
        div.onclick = () => selectChat('private', user.id, user.username);
        div.innerHTML = `
            <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                ${user.username[0].toUpperCase()}
            </div>
            <div>
                <h4 class="font-bold text-gray-900">${user.username}</h4>
                <p class="text-xs text-gray-500">${user.is_online ? 'Online' : 'Offline'}</p>
            </div>
        `;
        list.appendChild(div);
    });
}

createGroupBtn.onclick = () => {
    newChatModal.classList.add('hidden');
    createGroupModal.classList.remove('hidden');
};

groupForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('group-name').value;
    try {
        const response = await fetch(`${API_URL}/groups`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            const group = await response.json();
            createGroupModal.classList.add('hidden');
            loadGroups();
            selectChat('group', group.id, group.name);
        }
    } catch (err) {
        console.error('Group creation failed', err);
    }
};

document.querySelectorAll('.modal-close').forEach(btn => {
    btn.onclick = () => {
        newChatModal.classList.add('hidden');
        createGroupModal.classList.add('hidden');
    };
});

tabPrivate.onclick = () => {
    tabPrivate.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white shadow-sm text-blue-600';
    tabGroups.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg text-gray-500 hover:bg-white/50';
    renderChatList();
};

tabGroups.onclick = () => {
    tabGroups.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white shadow-sm text-blue-600';
    tabPrivate.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg text-gray-500 hover:bg-white/50';
    renderChatList();
};

// Handle clicks outside modals
window.onclick = (e) => {
    if (e.target === newChatModal) newChatModal.classList.add('hidden');
    if (e.target === createGroupModal) createGroupModal.classList.add('hidden');
};
