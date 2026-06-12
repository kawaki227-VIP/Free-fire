// Configuration Supabase
alert("script.js fonctionne !");
const SUPABASE_URL = 'https://kilczzeaqcmkeyliumsu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bCA3mt7htVdk3r1FaTl3CA_XH0yMsG2';

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


let currentUser = null;
let currentRoom = 'general';
let messageSubscription = null;
let audioRecorder = null;
let audioChunks = [];

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadStats();
    await loadRankings();
    setupEventListeners();
    
    if (window.location.pathname.includes('chat.html')) {
        initChat();
    }
    
    if (window.location.pathname.includes('dashboard.html')) {
        loadUserProfile();
    }
    
    if (window.location.pathname.includes('clans.html')) {
        loadClans();
    }
});

// Authentification
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        currentUser = user;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profile && !profile.is_banned) {
            updateUIForLoggedInUser(profile);
        } else if (profile && profile.is_banned) {
            alert('Votre compte a été banni');
            await logout();
        }
    }
}

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email, password
    });
    
    if (error) {
        alert('Erreur: ' + error.message);
        return false;
    }
    
    await checkAuth();
    closeModal('loginModal');
    window.location.href = 'dashboard.html';
    return true;
}

async function register(pseudo, email, password, uid, rank, region) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email, password
    });
    
    if (authError) {
        alert('Erreur: ' + authError.message);
        return false;
    }
    
    const accessCode = generateAccessCode();
    
    const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
            id: authData.user.id,
            pseudo: pseudo,
            uid: uid,
            rank: rank,
            region: region,
            level: 1,
            access_code: accessCode,
            created_at: new Date(),
            is_active: true
        }]);
    
    if (profileError) {
        alert('Erreur profil: ' + profileError.message);
        return false;
    }
    
    alert('Inscription réussie! Votre code d\'accès: ' + accessCode);
    closeModal('registerModal');
    return true;
}

async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

// Génération code d'accès
function generateAccessCode() {
    return 'FF-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Recherche
async function searchPlayer() {
    const searchTerm = document.getElementById('searchInput').value;
    if (!searchTerm) return;
    
    let query = supabase.from('profiles').select('*');
    
    if (searchTerm.includes('FF-')) {
        query = query.eq('access_code', searchTerm);
    } else if (!isNaN(searchTerm)) {
        query = query.eq('uid', searchTerm);
    } else {
        query = query.ilike('pseudo', `%${searchTerm}%`);
    }
    
    const { data, error } = await query;
    
    if (error) {
        alert('Erreur recherche: ' + error.message);
        return;
    }
    
    displaySearchResults(data);
}

function displaySearchResults(players) {
    const resultsDiv = document.getElementById('searchResults');
    if (!players || players.length === 0) {
        resultsDiv.innerHTML = '<p>Aucun joueur trouvé</p>';
        return;
    }
    
    resultsDiv.innerHTML = players.map(player => `
        <div class="player-card">
            <img src="${player.avatar_url || 'https://via.placeholder.com/50'}" alt="Avatar">
            <div>
                <h4>${player.pseudo}</h4>
                <p>UID: ${player.uid}</p>
                <p>Niveau: ${player.level} | Rang: ${player.rank}</p>
                <button onclick="viewProfile('${player.id}')" class="cyber-btn-small">Voir profil</button>
                <button onclick="likePlayer('${player.id}')" class="cyber-btn-small">❤️ ${player.likes || 0}</button>
            </div>
        </div>
    `).join('');
}

// Load stats
async function loadStats() {
    const { count: playersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    
    const { count: clansCount } = await supabase
        .from('clans')
        .select('*', { count: 'exact', head: true });
    
    const { count: uhdCount } = await supabase
        .from('uhd')
        .select('*', { count: 'exact', head: true });
    
    document.getElementById('totalPlayers').textContent = playersCount || 0;
    document.getElementById('totalClans').textContent = clansCount || 0;
    document.getElementById('totalUHD').textContent = uhdCount || 0;
}

// Load rankings
async function loadRankings() {
    // Top actifs
    const { data: activePlayers } = await supabase
        .from('profiles')
        .select('pseudo, level')
        .order('level', { ascending: false })
        .limit(5);
    
    if (activePlayers) {
        document.getElementById('activePlayersRanking').innerHTML = activePlayers
            .map(p => `<div>🏆 ${p.pseudo} - Niveau ${p.level}</div>`)
            .join('');
    }
    
    // Top UHD
    const { data: topUHD } = await supabase
        .from('uhd')
        .select('title, likes')
        .order('likes', { ascending: false })
        .limit(5);
    
    if (topUHD) {
        document.getElementById('popularUHD').innerHTML = topUHD
            .map(u => `<div>🔥 ${u.title} - ${u.likes} ❤️</div>`)
            .join('');
    }
    
    // Top clans
    const { data: topClans } = await supabase
        .from('clans')
        .select('name, members_count')
        .order('members_count', { ascending: false })
        .limit(5);
    
    if (topClans) {
        document.getElementById('popularClans').innerHTML = topClans
            .map(c => `<div>⚔️ ${c.name} - ${c.members_count} membres</div>`)
            .join('');
    }
}

// Chat functions
function initChat() {
    loadMessages();
    subscribeToMessages();
    setupChatEventListeners();
}

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(pseudo, avatar_url)')
        .eq('room', currentRoom)
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        console.error('Error loading messages:', error);
        return;
    }
    
    displayMessages(data);
}

function subscribeToMessages() {
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    
    messageSubscription = supabase
        .channel('messages')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${currentRoom}` },
            (payload) => {
                addMessageToUI(payload.new);
            }
        )
        .subscribe();
}

async function sendMessage() {
    if (!currentUser) {
        alert('Connectez-vous pour envoyer des messages');
        return;
    }
    
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    // Anti-spam: vérifier dernier message
    const { data: lastMessage } = await supabase
        .from('messages')
        .select('created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (lastMessage && lastMessage[0]) {
        const lastTime = new Date(lastMessage[0].created_at);
        const now = new Date();
        if (now - lastTime < 2000) {
            alert('Veuillez attendre 2 secondes entre chaque message');
            return;
        }
    }
    
    const { error } = await supabase
        .from('messages')
        .insert([{
            user_id: currentUser.id,
            room: currentRoom,
            content: content,
            created_at: new Date()
        }]);
    
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        input.value = '';
    }
}

function displayMessages(messages) {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = messages.map(msg => `
        <div class="message">
            <div class="message-header">
                <span class="message-sender">${msg.profiles.pseudo}</span>
                <span class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</span>
            </div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
        </div>
    `).join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addMessageToUI(message) {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML += `
        <div class="message">
            <div class="message-header">
                <span class="message-sender">${message.profiles?.pseudo || 'Utilisateur'}</span>
                <span class="message-time">${new Date(message.created_at).toLocaleTimeString()}</span>
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
        </div>
    `;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Upload functions
async function uploadAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const fileName = `${currentUser.id}_${Date.now()}`;
        
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file);
        
        if (uploadError) {
            alert('Erreur upload: ' + uploadError.message);
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', currentUser.id);
        
        alert('Avatar mis à jour!');
        location.reload();
    };
    input.click();
}

async function uploadUHD() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        const title = prompt('Titre de votre UHD:');
        
        if (!title) return;
        
        const fileName = `uhd_${currentUser.id}_${Date.now()}`;
        
        const { error: uploadError } = await supabase.storage
            .from('uhd')
            .upload(fileName, file);
        
        if (uploadError) {
            alert('Erreur upload: ' + uploadError.message);
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('uhd')
            .getPublicUrl(fileName);
        
        await supabase
            .from('uhd')
            .insert([{
                user_id: currentUser.id,
                title: title,
                media_url: publicUrl,
                media_type: file.type.startsWith('image') ? 'image' : 'video',
                created_at: new Date()
            }]);
        
        alert('UHD publié!');
        loadUserProfile();
    };
    fileInput.click();
}

// Profile functions
async function loadUserProfile() {
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (profile) {
        document.getElementById('profileNickname').textContent = profile.pseudo;
        document.getElementById('profileUID').textContent = profile.uid;
        document.getElementById('profileAvatar').src = profile.avatar_url || 'https://via.placeholder.com/150';
        document.getElementById('joinDate').textContent = new Date(profile.created_at).toLocaleDateString();
        document.getElementById('accessCode').textContent = profile.access_code;
        document.getElementById('playerLevel').textContent = profile.level;
        document.getElementById('levelSlider').value = profile.level;
        document.getElementById('playerRank').value = profile.rank;
        document.getElementById('playerRegion').value = profile.region;
        document.getElementById('playerBio').value = profile.bio || '';
        
        loadMyUHD();
    }
}

async function updateProfile() {
    const updates = {
        level: parseInt(document.getElementById('levelSlider').value),
        rank: document.getElementById('playerRank').value,
        region: document.getElementById('playerRegion').value,
        bio: document.getElementById('playerBio').value
    };
    
    const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', currentUser.id);
    
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        alert('Profil mis à jour!');
    }
}

async function deactivateProfile() {
    const accessCode = prompt('Entrez votre code d\'accès pour désactiver votre profil:');
    const { data: profile } = await supabase
        .from('profiles')
        .select('access_code')
        .eq('id', currentUser.id)
        .single();
    
    if (accessCode === profile.access_code) {
        await supabase
            .from('profiles')
            .update({ is_active: false })
            .eq('id', currentUser.id);
        alert('Profil désactivé');
        await logout();
    } else {
        alert('Code d\'accès incorrect');
    }
}

async function loadMyUHD() {
    const { data: uhdList } = await supabase
        .from('uhd')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    const uhdGrid = document.getElementById('myUHD');
    if (uhdList && uhdList.length > 0) {
        uhdGrid.innerHTML = uhdList.map(uhd => `
            <div class="uhd-card">
                ${uhd.media_type === 'image' ? 
                    `<img src="${uhd.media_url}" alt="${uhd.title}" style="max-width: 100%;">` :
                    `<video src="${uhd.media_url}" controls style="max-width: 100%;"></video>`
                }
                <h4>${uhd.title}</h4>
                <p>❤️ ${uhd.likes || 0} likes</p>
                <button onclick="likeUHD('${uhd.id}')" class="cyber-btn-small">Like</button>
            </div>
        `).join('');
    } else {
        uhdGrid.innerHTML = '<p>Aucun UHD publié</p>';
    }
}

// Clan functions
async function loadClans() {
    const { data: clans } = await supabase
        .from('clans')
        .select('*, profiles(pseudo)')
        .order('members_count', { ascending: false });
    
    const clansGrid = document.getElementById('clansList');
    if (clans && clans.length > 0) {
        clansGrid.innerHTML = clans.map(clan => `
            <div class="clan-card">
                <img src="${clan.logo_url || 'https://via.placeholder.com/100'}" alt="${clan.name}">
                <h3>${clan.name}</h3>
                <p>${clan.description || 'Aucune description'}</p>
                <p>Chef: ${clan.profiles.pseudo}</p>
                <p>👥 ${clan.members_count || 1} membres</p>
                <button onclick="joinClan('${clan.id}')" class="cyber-btn-small">Rejoindre</button>
            </div>
        `).join('');
    }
}

async function createClan(name, description, logoUrl) {
    const { error } = await supabase
        .from('clans')
        .insert([{
            name: name,
            description: description,
            logo_url: logoUrl,
            leader_id: currentUser.id,
            created_at: new Date(),
            members_count: 1
        }]);
    
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        alert('Clan créé!');
        closeModal('createClanModal');
        loadClans();
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyAccessCode() {
    const code = document.getElementById('accessCode').textContent;
    navigator.clipboard.writeText(code);
    alert('Code copié!');
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const email = e.target[0].value;
            const password = e.target[1].value;
            login(email, password);
        };
    }
    
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.onsubmit = (e) => {
            e.preventDefault();
            const pseudo = e.target[0].value;
            const email = e.target[1].value;
            const password = e.target[2].value;
            const uid = e.target[3].value;
            const rank = e.target[4].value;
            const region = e.target[5].value;
            register(pseudo, email, password, uid, rank, region);
        };
    }
    
    // Create clan form
    const createClanForm = document.getElementById('createClanForm');
    if (createClanForm) {
        createClanForm.onsubmit = (e) => {
            e.preventDefault();
            const name = e.target[0].value;
            const description = e.target[1].value;
            const logoUrl = e.target[2].value;
            createClan(name, description, logoUrl);
        };
    }
    
    // Level slider
    const levelSlider = document.getElementById('levelSlider');
    if (levelSlider) {
        levelSlider.oninput = (e) => {
            document.getElementById('playerLevel').textContent = e.target.value;
        };
    }
}

function setupChatEventListeners() {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    const rooms = document.querySelectorAll('.chat-room');
    rooms.forEach(room => {
        room.addEventListener('click', () => {
            rooms.forEach(r => r.classList.remove('active'));
            room.classList.add('active');
            currentRoom = room.dataset.room;
            loadMessages();
            subscribeToMessages();
        });
    });
}

// File upload functions
function uploadChatImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const fileName = `chat_${Date.now()}`;
        
        const { error } = await supabase.storage
            .from('chat_media')
            .upload(fileName, file);
        
        if (!error) {
            const { data: { publicUrl } } = supabase.storage
                .from('chat_media')
                .getPublicUrl(fileName);
            
            document.getElementById('chatInput').value = `[Image] ${publicUrl}`;
        }
    };
    input.click();
}

function recordAudio() {
    if (audioRecorder && audioRecorder.state === 'recording') {
        audioRecorder.stop();
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            audioRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            audioRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const fileName = `audio_${Date.now()}.webm`;
                
                const { error } = await supabase.storage
                    .from('chat_media')
                    .upload(fileName, audioBlob);
                
                if (!error) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('chat_media')
                        .getPublicUrl(fileName);
                    
                    document.getElementById('chatInput').value = `[Audio] ${publicUrl}`;
                }
                
                stream.getTracks().forEach(track => track.stop());
            };
            
            audioRecorder.start();
            alert('Enregistrement audio... Cliquez à nouveau pour arrêter');
        });
}
