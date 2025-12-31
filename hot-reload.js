// hot-reload.js - Sistema de hot reload que preserva estado
class HotReload {
    constructor(checkInterval = 2000) {
        this.checkInterval = checkInterval;
        this.lastModified = null;
        this.isReloading = false;
        
        // Salva referências aos dados globais do main.js
        this.savedState = {
            allEvents: [],
            activeAlarms: new Map(),
            activePendentes: new Map(),
            currentClientId: null,
            selectedEvent: null
        };
        
        this.init();
    }

    init() {
        console.log('🔄 Hot Reload ativado');
        this.checkForUpdates();
        setInterval(() => this.checkForUpdates(), this.checkInterval);
        
        // Intercepta antes do unload para salvar estado
        window.addEventListener('beforeunload', () => this.saveState());
    }

    async checkForUpdates() {
        try {
            const response = await fetch(window.location.href, {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            const lastMod = response.headers.get('Last-Modified');
            
            if (this.lastModified === null) {
                this.lastModified = lastMod;
                return;
            }
            
            if (lastMod !== this.lastModified) {
                console.log('🔄 Mudança detectada no HTML');
                this.lastModified = lastMod;
                await this.reload();
            }
        } catch (err) {
            // Silencioso - não precisa logar erro de verificação
        }
    }

    saveState() {
        try {
            // Salva estado atual no sessionStorage
            const state = {
                allEvents: window.allEvents || [],
                activeAlarms: Array.from(window.activeAlarms || new Map()),
                activePendentes: Array.from(window.activePendentes || new Map()),
                currentClientId: window.currentClientId || null,
                selectedEvent: window.selectedEvent || null,
                selectedUnit: document.getElementById('unit-select')?.value || null,
                autoUpdate: document.getElementById('auto-update')?.checked || false
            };
            
            sessionStorage.setItem('viawebState', JSON.stringify(state));
            console.log('💾 Estado salvo:', state.allEvents.length, 'eventos');
        } catch (err) {
            console.error('❌ Erro ao salvar estado:', err);
        }
    }

    restoreState() {
        try {
            const saved = sessionStorage.getItem('viawebState');
            if (!saved) return false;
            
            const state = JSON.parse(saved);
            
            // Restaura variáveis globais
            if (window.allEvents && state.allEvents) {
                window.allEvents.push(...state.allEvents);
            }
            
            if (window.activeAlarms && state.activeAlarms) {
                state.activeAlarms.forEach(([key, value]) => {
                    window.activeAlarms.set(key, value);
                });
            }
            
            if (window.activePendentes && state.activePendentes) {
                state.activePendentes.forEach(([key, value]) => {
                    window.activePendentes.set(key, value);
                });
            }
            
            if (state.currentClientId) {
                window.currentClientId = state.currentClientId;
            }
            
            if (state.selectedEvent) {
                window.selectedEvent = state.selectedEvent;
            }
            
            // Restaura UI
            if (state.selectedUnit) {
                const unitSelect = document.getElementById('unit-select');
                if (unitSelect) {
                    unitSelect.value = state.selectedUnit;
                    unitSelect.dispatchEvent(new Event('change'));
                }
            }
            
            if (state.autoUpdate) {
                const autoUpdateCheck = document.getElementById('auto-update');
                if (autoUpdateCheck) {
                    autoUpdateCheck.checked = true;
                    autoUpdateCheck.dispatchEvent(new Event('change'));
                }
            }
            
            // Atualiza contadores e lista de eventos
            if (window.updateCounts) window.updateCounts();
            if (window.updateEventList) window.updateEventList();
            
            console.log('✅ Estado restaurado:', state.allEvents.length, 'eventos');
            
            // Limpa o estado salvo
            sessionStorage.removeItem('viawebState');
            
            return true;
        } catch (err) {
            console.error('❌ Erro ao restaurar estado:', err);
            return false;
        }
    }

    async reload() {
        if (this.isReloading) return;
        this.isReloading = true;
        
        console.log('🔄 Recarregando página...');
        
        // Salva estado antes de recarregar
        this.saveState();
        
        // Aguarda um pouco para garantir que salvou
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Recarrega a página
        window.location.reload();
    }
}

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.hotReload = new HotReload();
    });
} else {
    window.hotReload = new HotReload();
}

// Tenta restaurar estado ao carregar
window.addEventListener('load', () => {
    if (window.hotReload) {
        // Aguarda main.js carregar
        setTimeout(() => {
            window.hotReload.restoreState();
        }, 500);
    }
});