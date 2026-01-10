// users-db.js - User management (global pattern, no ESM)
(function() {
    'use strict';
    
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
    let cachedUsers = null;
    let cacheTimestamp = null;

    let usersByMatricula = new Map();
    let usersByIsep = new Map();

    const API_URL = '/api/users';

    console.log(`🔗 API de usuários configurada para: ${API_URL}`);

    // Title Case para cargos (respeita acentuação)
    function toTitleCaseCargo(str = '') {
        return String(str)
            .toLocaleLowerCase('pt-BR')
            .split(/\s+/)
            .filter(Boolean)
            .map(p => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1))
            .join(' ');
    }

    async function getUsers(forceRefresh = false) {
        if (!forceRefresh && cachedUsers && cacheTimestamp) {
            const now = Date.now();
            if (now - cacheTimestamp < CACHE_DURATION) {
                console.log('📦 Usando usuários em cache');
                return cachedUsers;
            }
        }

        try {
            console.log('🔍 Buscando usuários da API...');
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                cachedUsers = result.data;
                cacheTimestamp = Date.now();
                
                // Constrói índices para busca rápida
                buildIndexes();
                
                console.log(`✅ ${cachedUsers.length} usuários carregados da API`);
                return cachedUsers;
            } else {
                throw new Error('Formato de resposta inválido');
            }
        } catch (err) {
            console.error('❌ Erro ao buscar usuários:', err);
            if (cachedUsers) {
                console.log('⚠️ Usando cache antigo devido a erro');
                return cachedUsers;
            }
            console.log('⚠️ Retornando array vazio');
            return [];
        }
    }

    function buildIndexes() {
        usersByMatricula.clear();
        usersByIsep.clear();
        
        if (!cachedUsers) return;
        
        cachedUsers.forEach(user => {
            // Índice por matrícula/ID_USUARIO (zona/usuário)
            if (user.matricula) {
                usersByMatricula.set(String(user.matricula), user);
            }
            if (user.ID_USUARIO) {
                usersByMatricula.set(String(user.ID_USUARIO), user);
            }
            
            // Índice por ISEP (pode ter múltiplos usuários por ISEP)
            if (user.idIsep) {
                const isep = String(user.idIsep);
                if (!usersByIsep.has(isep)) {
                    usersByIsep.set(isep, []);
                }
                usersByIsep.get(isep).push(user);
            }
        });
        
        console.log(`📊 Índices construídos: ${usersByMatricula.size} IDs, ${usersByIsep.size} ISEPs`);
    }

    function getUserByMatricula(matricula) {
        if (!usersByMatricula.size && cachedUsers) {
            buildIndexes();
        }
        
        const user = usersByMatricula.get(String(matricula));
        if (user) {
            console.log(`👤 Usuário encontrado: ${user.nome} (${matricula})`);
        }
        return user || null;
    }

    function getUsersByIsep(idIsep) {
        if (!usersByIsep.size && cachedUsers) {
            buildIndexes();
        }
        
        const users = usersByIsep.get(String(idIsep)) || [];
        console.log(`👥 ${users.length} usuários encontrados para ISEP ${idIsep}`);
        return users;
    }

    function getUserByMatriculaAndIsep(matricula, idIsep) {
        const user = getUserByMatricula(matricula);
        
        if (user && user.idIsep === String(idIsep)) {
            return user;
        }
        
        return null;
    }

    function formatUserName(user) {
        if (!user) return 'Usuário Desconhecido';
        
        const nome = user.nome || 'Sem nome';
        const cargoRaw = user.cargo || '';
        const cargo = cargoRaw ? ` (${toTitleCaseCargo(cargoRaw)})` : '';
        
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

    function hasUsersData() {
        return cachedUsers && cachedUsers.length > 0;
    }

    function clearUsersCache() {
        cachedUsers = null;
        cacheTimestamp = null;
        usersByMatricula.clear();
        usersByIsep.clear();
        console.log('🗑️ Cache de usuários limpo');
    }

    function getUsersStats() {
        if (!cachedUsers) {
            return {
                total: 0,
                porIsep: 0,
                lastUpdate: null
            };
        }
        
        return {
            total: cachedUsers.length,
            porIsep: usersByIsep.size,
            lastUpdate: cacheTimestamp ? new Date(cacheTimestamp).toLocaleString('pt-BR') : null
        };
    }
    
    // Expose to global scope
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