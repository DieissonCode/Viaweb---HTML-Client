// units-db.js - Browser-compatible global module (no ESM)
const DEBUG_UNITS = 0; // 1 = ATIVADO | 2 = DESATIVADO

(function() {
    'use strict';
    
    const CACHE_DURATION = 5 * 60 * 1000;
    let cachedUnits = null;
    let cacheTimestamp = null;

    // API na mesma porta do HTTP (80)
    const API_URL = '/api/units';  // ← URL RELATIVA!

    DEBUG_UNITS && console.log(`🔗 API configurada para: ${API_URL}`);

    async function getUnits(forceRefresh = false) {
        if (!forceRefresh && cachedUnits && cacheTimestamp) {
            const now = Date.now();
            if (now - cacheTimestamp < CACHE_DURATION) {
                DEBUG_UNITS && console.log('📦 Usando unidades em cache');
                return cachedUnits;
            }
        }

        try {
            DEBUG_UNITS && console.log('🔍 Buscando unidades da API...');
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
                    sigla: unit.local.substring(0, 3).toUpperCase()
                }))
                .sort((a, b) => a.local.localeCompare(b.local)); // Ordena por nome
                
                cacheTimestamp = Date.now();
                DEBUG_UNITS && console.log(`✅ ${cachedUnits.length} unidades carregadas da API`);
                return cachedUnits;
            } else {
                throw new Error('Formato de resposta inválido');
            }
        } catch (err) {
            DEBUG_UNITS && console.error('❌ Erro ao buscar unidades:', err);
            if (cachedUnits) {
                DEBUG_UNITS && console.log('⚠️ Usando cache antigo devido a erro');
                return cachedUnits;
            }
            DEBUG_UNITS && console.log('⚠️ Usando dados de fallback');
            return getFallbackUnits();
        }
    }

    function getFallbackUnits() {
        return [
            { value: '0001', local: 'UNIDADE TESTE', label: 'UNIDADE TESTE', sigla: 'UNI' }
        ];
    }

    function clearCache() {
        cachedUnits = null;
        cacheTimestamp = null;
        DEBUG_UNITS && console.log('🗑️ Cache de unidades limpo');
    }
    
    // Expose to global scope
    window.getUnits = getUnits;
    window.clearUnitsCache = clearCache;
})();