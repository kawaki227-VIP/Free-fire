-- FREE FIRE CYBER DATABASE - Schéma SQL Complet
-- Exécuter dans l'éditeur SQL de Supabase

-- 1. Table des profils utilisateurs
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pseudo VARCHAR(50) UNIQUE NOT NULL,
    uid VARCHAR(20) UNIQUE NOT NULL,
    level INTEGER DEFAULT 1,
    rank VARCHAR(50) DEFAULT 'Bronze',
    region VARCHAR(50),
    bio TEXT,
    avatar_url TEXT,
    access_code VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_banned BOOLEAN DEFAULT false,
    is_admin BOOLEAN DEFAULT false,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Table des UHD (médias)
CREATE TABLE uhd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    media_url TEXT NOT NULL,
    media_type VARCHAR(20) CHECK (media_type IN ('image', 'video')),
    likes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Table des clans
CREATE TABLE clans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    leader_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    members_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Table des membres de clans
CREATE TABLE clan_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(clan_id, user_id)
);

-- 5. Table des messages du chat
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    room VARCHAR(50) DEFAULT 'general',
    content TEXT NOT NULL,
    media_url TEXT,
    media_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Table des likes
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_type VARCHAR(20) CHECK (target_type IN ('profile', 'uhd')),
    target_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, target_type, target_id)
);

-- 7. Table des signalements
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reported_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX idx_profiles_pseudo ON profiles(pseudo);
CREATE INDEX idx_profiles_uid ON profiles(uid);
CREATE INDEX idx_profiles_access_code ON profiles(access_code);
CREATE INDEX idx_messages_room ON messages(room);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_uhd_user_id ON uhd(user_id);
CREATE INDEX idx_clans_name ON clans(name);
CREATE INDEX idx_likes_target ON likes(target_type, target_id);

-- 8. Politiques RLS (Row Level Security)

-- Activer RLS sur toutes les tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uhd ENABLE ROW LEVEL SECURITY;
ALTER TABLE clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can delete profiles" ON profiles
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- Messages policies
CREATE POLICY "Messages are viewable by everyone" ON messages
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert messages" ON messages
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete own messages" ON messages
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any message" ON messages
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- UHD policies
CREATE POLICY "UHD are viewable by everyone" ON uhd
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own UHD" ON uhd
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own UHD" ON uhd
    FOR DELETE USING (auth.uid() = user_id);

-- Clans policies
CREATE POLICY "Clans are viewable by everyone" ON clans
    FOR SELECT USING (true);

CREATE POLICY "Users can create clans" ON clans
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Clan leaders can update clan" ON clans
    FOR UPDATE USING (auth.uid() = leader_id);

CREATE POLICY "Admins can delete any clan" ON clans
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 9. Triggers pour mise à jour automatique

-- Mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Mettre à jour members_count des clans
CREATE OR REPLACE FUNCTION update_clan_members_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE clans SET members_count = members_count + 1 WHERE id = NEW.clan_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE clans SET members_count = members_count - 1 WHERE id = OLD.clan_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clan_members_count_trigger
    AFTER INSERT OR DELETE ON clan_members
    FOR EACH ROW
    EXECUTE FUNCTION update_clan_members_count();

-- 10. Créer un compte admin par défaut
-- (Remplacer par vos identifiants après création)
INSERT INTO auth.users (email, encrypted_password)
VALUES ('admin@ffcyber.com', crypt('Admin123!', gen_salt('bf')))
ON CONFLICT DO NOTHING;

-- Donner les droits admin
UPDATE profiles 
SET is_admin = true 
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@ffcyber.com');