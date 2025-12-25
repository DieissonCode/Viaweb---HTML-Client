// units-db.js - Busca unidades da API REST
const API_URL = 'http://localhost:3000/api/units';

let cachedUnits = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function getUnits(forceRefresh = false) {
    // Retorna cache se válido
    if (!forceRefresh && cachedUnits && cacheTimestamp) {
        const now = Date.now();
        if (now - cacheTimestamp < CACHE_DURATION) {
            console.log('📦 Usando unidades em cache');
            return cachedUnits;
        }
    }

    try {
        console.log('🔍 Buscando unidades da API...');
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            cachedUnits = result.data.map(unit => ({
                value: String(unit.value),
                local: unit.local,
                label: unit.label || unit.local,
                sigla: unit.local.substring(0, 3).toUpperCase() // Primeira parte como sigla
            }));
            cacheTimestamp = Date.now();
            console.log(`✅ ${cachedUnits.length} unidades carregadas`);
            return cachedUnits;
        } else {
            throw new Error('Formato de resposta inválido');
        }
    } catch (err) {
        console.error('❌ Erro ao buscar unidades:', err);
        
        // Retorna cache antigo se houver erro
        if (cachedUnits) {
            console.log('⚠️ Usando cache antigo devido a erro');
            return cachedUnits;
        }
        
        // Retorna dados de fallback se não houver cache
        console.log('⚠️ Usando dados de fallback');
        return getFallbackUnits();
    }
}

// Dados de fallback caso a API falhe
function getFallbackUnits() {
    return [
        { value: "1", local: "Balança", label: "Balança", sigla: "BAL" },
        { value: "2", local: "Administrativo", label: "Administrativo", sigla: "ADM" },
        { value: "3", local: "Defensivos", label: "Defensivos", sigla: "DEF" },
        { value: "4", local: "Fertilizantes", label: "Fertilizantes", sigla: "FER" },
        { value: "5", local: "Loja", label: "Loja", sigla: "LOJ" },
        { value: "6", local: "Supermercado", label: "Supermercado", sigla: "SUP" },
        { value: "7", local: "AFC", label: "AFC", sigla: "AFC" },
        { value: "8", local: "Casa", label: "Casa", sigla: "CAS" }
    ];
}

// Força atualização do cache
export function refreshUnits() {
    console.log('🔄 Forçando atualização das unidades...');
    return getUnits(true);
}

// Limpa o cache
export function clearCache() {
    cachedUnits = null;
    cacheTimestamp = null;
    console.log('🗑️ Cache limpo');
}