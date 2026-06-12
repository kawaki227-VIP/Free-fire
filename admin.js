// Admin Panel JavaScript
let adminUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAuth();
    loadAdminStats();
    loadPlayers();
    loadMessages();
    loadClans();
    setupAdminTabs();
});

async function checkAdminAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
    
    if (!profile || !profile.is_admin) {
        alert('Accès réservé aux administrateurs');
        window.location.href = 'dashboard.html';
        return;
    }
    
    adminUser = user;
    document.getElementById('adminName').textContent = user.email;
}

async function loadAdminStats() {
    // Total players
    const { count: playersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    
    // Today's messages
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayMessages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());
    
    // Banned players
    const { count: bannedCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true);
    
    // Total clans
    const { count: clansCount } = await supabase
        .from('clans')
        .select('*', { count: 'exact', head: true });
    
    document.getElementById('totalPlayers').textContent = playersCount || 0;
    document.getElementById('todayMessages').textContent = todayMessages || 0;
    document.getElementById('bannedPlayers').textContent = bannedCount || 0;
    document.getElementById('totalClans').textContent = clansCount || 0;
}

async function loadPlayers(search = '') {
    let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (search) {
        query = query.or(`pseudo.ilike.%${search}%,uid.ilike.%${search}%`);
    }
    
    const { data: players } = await query;
    
    const tableBody = document.getElementById('playersTable');
    if (players && players.length > 0) {
        tableBody.innerHTML = players.map(player => `
            <tr>
                <td>${player.pseudo}</td>
                <td>${player.uid}</td>
                <td>${player.level}</td>
                <td>${player.is_banned ? '<span style="color: #ff0055">Banni</span>' : '<span style="color: #00ff41">Actif</span>'}</td>
                <td>
                    ${!player.is_banned ? 
                        `<button onclick="banPlayer('${player.id}')" class="cyber-btn-small">Bannir</button>` :
                        `<button onclick="unbanPlayer('${player.id}')" class="cyber-btn-small">Débannir</button>`
                    }
                    <button onclick="deletePlayer('${player.id}')" class="cyber-btn-small cyber-btn-danger">Supprimer</button>
                    <button onclick="viewPlayerDetails('${player.id}')" class="cyber-btn-small">Détails</button>
                </td>
            </tr>
        `).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="5">Aucun joueur trouvé</td></tr>';
    }
}

async function loadMessages() {
    const { data: messages } = await supabase
        .from('messages')
        .select('*, profiles(pseudo)')
        .order('created_at', { ascending: false })
        .limit(100);
    
    const tableBody = document.getElementById('messagesTable');
    if (messages && messages.length > 0) {
        tableBody.innerHTML = messages.map(msg => `
            <tr>
                <td>${msg.profiles?.pseudo || 'Inconnu'}</td>
                <td>${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}</td>
                <td>${msg.room}</td>
                <td>${new Date(msg.created_at).toLocaleString()}</td>
                <td>
                    <button onclick="deleteMessage('${msg.id}')" class="cyber-btn-small cyber-btn-danger">Supprimer</button>
                </td>
            </tr>
        `).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="5">Aucun message trouvé</td></tr>';
    }
}

async function loadClans() {
    const { data: clans } = await supabase
        .from('clans')
        .select('*, profiles(pseudo)')
        .order('created_at', { ascending: false });
    
    const tableBody = document.getElementById('clansTable');
    if (clans && clans.length > 0) {
        tableBody.innerHTML = clans.map(clan => `
            <tr>
                <td>${clan.name}</td>
                <td>${clan.profiles?.pseudo || 'Inconnu'}</td>
                <td>${clan.members_count || 1}</td>
                <td>${new Date(clan.created_at).toLocaleDateString()}</td>
                <td>
                    <button onclick="deleteClan('${clan.id}')" class="cyber-btn-small cyber-btn-danger">Supprimer</button>
                </td>
            </tr>
        `).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="5">Aucun clan trouvé</td></tr>';
    }
}

// Admin actions
async function banPlayer(userId) {
    if (confirm('Confirmer le bannissement de ce joueur ?')) {
        const { error } = await supabase
            .from('profiles')
            .update({ is_banned: true })
            .eq('id', userId);
        
        if (error) {
            alert('Erreur: ' + error.message);
        } else {
            alert('Joueur banni');
            loadPlayers();
            loadAdminStats();
        }
    }
}

async function unbanPlayer(userId) {
    const { error } = await supabase
        .from('profiles')
        .update({ is_banned: false })
        .eq('id', userId);
    
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        alert('Joueur débanni');
        loadPlayers();
        loadAdminStats();
    }
}

async function deletePlayer(userId) {
    if (confirm('⚠️ Supprimer définitivement ce joueur ? Cette action est irréversible.')) {
        // Delete user data
        await supabase.from('messages').delete().eq('user_id', userId);
        await supabase.from('uhd').delete().eq('user_id', userId);
        
        // Delete profile and auth user
        const { error } = await supabase.auth.admin.deleteUser(userId);
        
        if (error) {
            alert('Erreur: ' + error.message);
        } else {
            alert('Joueur supprimé');
            loadPlayers();
            loadAdminStats();
        }
    }
}

async function deleteMessage(messageId) {
    if (confirm('Supprimer ce message ?')) {
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId);
        
        if (error) {
            alert('Erreur: ' + error.message);
        } else {
            alert('Message supprimé');
            loadMessages();
        }
    }
}

async function deleteClan(clanId) {
    if (confirm('Supprimer ce clan ?')) {
        const { error } = await supabase
            .from('clans')
            .delete()
            .eq('id', clanId);
        
        if (error) {
            alert('Erreur: ' + error.message);
        } else {
            alert('Clan supprimé');
            loadClans();
            loadAdminStats();
        }
    }
}

function setupAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            document.getElementById(`${tabId}Tab`).classList.add('active');
            
            if (tabId === 'players') loadPlayers();
            if (tabId === 'messages') loadMessages();
            if (tabId === 'clans') loadClans();
        });
    });
    
    // Search player
    const searchInput = document.getElementById('adminPlayerSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            loadPlayers(e.target.value);
        });
    }
}

function viewPlayerDetails(playerId) {
    window.open(`profile.html?id=${playerId}`, '_blank');
}