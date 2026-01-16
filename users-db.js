// users-db.js - User management (global pattern, no ESM)
(function() {
    'use strict';
    
    const CACHE_KEY = 'viaweb_users_cache';
    const CACHE_TS_KEY = 'viaweb_users_ts';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
    let cachedUsers = null;
    let cacheTimestamp = null;

    let usersByMatricula = new Map();
    let usersByIsep = new Map();

    const API_URL = '/api/users';

    console.log(`🔗 API de usuários configurada para: ${API_URL}`);

    // ========================================
    // PERSISTÊNCIA (localStorage)
    // ========================================
    function saveToLocalStorage() {
        try {
            if (!cachedUsers || cachedUsers.length === 0) {
                console.warn('⚠️ Tentativa de salvar cache vazio - IGNORADO');
                return;
            }
            
            // Remove campos desnecessários para economizar espaço
            const minimal = cachedUsers.map(u => ({
                ID_USUARIO: u.ID_USUARIO,
                matricula: u.matricula,
                idIsep: u.idIsep,
                nome: u.nome,
                cargo: u.cargo
            }));
            
            const jsonStr = JSON.stringify(minimal);
            const sizeKB = (jsonStr.length / 1024).toFixed(2);
            
            localStorage.setItem(CACHE_KEY, jsonStr);
            localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
            
            console.log(`✅ Cache salvo: ${minimal.length} usuários (${sizeKB} KB)`);
        } catch (e) {
            console.error('❌ Falha ao salvar cache:', e.message);
            
            if (e.name === 'QuotaExceededError') {
                console.warn('💾 Espaço insuficiente, limpando localStorage...');
                localStorage.clear();
                try {
                    const minimal = cachedUsers.map(u => ({
                        ID_USUARIO: u.ID_USUARIO,
                        matricula: u.matricula,
                        idIsep: u.idIsep,
                        nome: u.nome,
                        cargo: u.cargo
                    }));
                    localStorage.setItem(CACHE_KEY, JSON.stringify(minimal));
                    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
                    console.log('✅ Cache salvo após limpeza');
                } catch (e2) {
                    console.error('❌ Falha mesmo após limpeza:', e2.message);
                }
            }
        }
    }

    function loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(CACHE_KEY);
            const ts = localStorage.getItem(CACHE_TS_KEY);
            
            if (!saved) {
                console.log('ℹ️ Nenhum cache encontrado no localStorage');
                return false;
            }
            
            const parsed = JSON.parse(saved);
            
            if (!Array.isArray(parsed) || parsed.length === 0) {
                console.warn('⚠️ Cache inválido ou vazio:', parsed?.length || 0);
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(CACHE_TS_KEY);
                return false;
            }
            
            cachedUsers = parsed;
            cacheTimestamp = parseInt(ts) || Date.now();
            buildIndexes();
            console.log(`✅ ${cachedUsers.length} usuários carregados do localStorage`);
            return true;
        } catch (e) {
            console.error('❌ Falha ao carregar cache:', e);
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TS_KEY);
        }
        return false;
    }

    // ========================================
    // ÍNDICES
    // ========================================
    function buildIndexes() {
        usersByMatricula.clear();
        usersByIsep.clear();
        
        if (!cachedUsers) return;
        
        cachedUsers.forEach(user => {
            if (user.matricula) {
                usersByMatricula.set(String(user.matricula), user);
            }
            if (user.ID_USUARIO) {
                usersByMatricula.set(String(user.ID_USUARIO), user);
            }
            
            if (user.idIsep) {
                const isep = String(user.idIsep);
                if (!usersByIsep.has(isep)) {
                    usersByIsep.set(isep, []);
                }
                usersByIsep.get(isep).push(user);
            }
        });
        
        console.log(`📊 Índices: ${usersByMatricula.size} IDs, ${usersByIsep.size} ISEPs`);
    }

    // ========================================
    // CARREGAMENTO
    // ========================================
    async function getUsers(forceRefresh = false) {
        // 1. Boot instantâneo do localStorage
        if (!cachedUsers || cachedUsers.length === 0) {
            const loaded = loadFromLocalStorage();
            if (loaded && cachedUsers && cachedUsers.length > 0) {
                console.log(`✅ ${cachedUsers.length} usuários carregados (boot)`);
            }
        }
        
        // 2. Verifica cache válido
        if (!forceRefresh && cachedUsers && cachedUsers.length > 0 && cacheTimestamp) {
            const now = Date.now();
            if (now - cacheTimestamp < CACHE_DURATION) {
                console.log(`📦 Cache OK: ${cachedUsers.length} usuários`);
                return cachedUsers;
            }
        }
        
        // 3. Busca da API
        try {
            console.log('🔍 Buscando da API...');
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            console.log('📥 API:', {
                success: result.success,
                count: result.data?.length || 0
            });
            
            if (result.success && result.data && result.data.length > 0) {
                cachedUsers = result.data;
                cacheTimestamp = Date.now();
                buildIndexes();
                saveToLocalStorage();
                console.log(`✅ ${cachedUsers.length} usuários da API`);
                return cachedUsers;
            } else {
                if (cachedUsers && cachedUsers.length > 0) {
                    console.warn(`⚠️ API vazia, mantendo ${cachedUsers.length} do cache`);
                    return cachedUsers;
                } else {
                    console.error('❌ API vazia e sem cache!');
                    return [];
                }
            }
        } catch (err) {
            console.error('❌ Erro API:', err.message);
            if (cachedUsers && cachedUsers.length > 0) {
                console.warn(`⚠️ Erro, usando ${cachedUsers.length} do cache`);
                return cachedUsers;
            }
            return [];
        }
    }

    // ========================================
    // CONSULTAS
    // ========================================
    function getUserByMatricula(matricula) {
        if (usersByMatricula.size === 0 && cachedUsers) buildIndexes();
        return usersByMatricula.get(String(matricula)) || null;
    }

    function getUsersByIsep(idIsep) {
        if (usersByIsep.size === 0 && cachedUsers) buildIndexes();
        return usersByIsep.get(String(idIsep)) || [];
    }

    function getUserByMatriculaAndIsep(matricula, idIsep) {
        const user = getUserByMatricula(matricula);
        return (user && user.idIsep === String(idIsep)) ? user : null;
    }

    // ========================================
    // FORMATAÇÃO
    // ========================================
    function toTitleCaseCargo(str = '') {
        return String(str)
            .toLocaleLowerCase('pt-BR')
            .split(/\s+/)
            .filter(Boolean)
            .map(p => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1))
            .join(' ');
    }

    function formatUserName(user) {
        if (!user) return 'Usuário Desconhecido';
        const nome = user.nome || 'Sem nome';
        const cargo = user.cargo ? ` (${toTitleCaseCargo(user.cargo)})` : '';
        return `${nome}${cargo}`;
    }

    function formatUserInfo(user) {
        if (!user) return 'Informações não disponíveis';
        const info = [];
        if (user.nome) info.push(`Nome: ${user.nome}`);
        if (user.cargo) info.push(`Cargo: ${toTitleCaseCargo(user.cargo)}`);
        if (user.setor) info.push(`Setor: ${user.setor}`);
        if (user.local) info.push(`Local: ${user.local}`);
        if (user.c_custo) info.push(`C.Custo: ${user.c_custo}`);
        if (user.telefone1) info.push(`Tel: ${user.telefone1}`);
        if (user.telefone2) info.push(`Tel2: ${user.telefone2}`);
        if (user.ramal) info.push(`Ramal: ${user.ramal}`);
        if (user.unidade) info.push(`Unidade: ${user.unidade}`);
        return info.join('\n');
    }

    // ========================================
    // UTILIDADES
    // ========================================
    function hasUsersData() {
        return !!(cachedUsers && cachedUsers.length > 0);
    }

    function clearUsersCache() {
        cachedUsers = null;
        cacheTimestamp = null;
        usersByMatricula.clear();
        usersByIsep.clear();
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TS_KEY);
        console.log('🗑️ Cache limpo');
    }

    function getUsersStats() {
        return {
            total: cachedUsers?.length || 0,
            porIsep: usersByIsep.size,
            lastUpdate: cacheTimestamp ? new Date(cacheTimestamp).toLocaleString('pt-BR') : null
        };
    }
    
    // ========================================
    // EXPOSIÇÃO GLOBAL
    // ========================================
    window.UsersDB = {
        getUsers,
        getUserByMatricula,
        getUsersByIsep,
        getUserByMatriculaAndIsep,
        formatUserName,
        formatUserInfo,
        hasUsersData,
        clearUsersCache,
        getUsersStats
    };
})();
