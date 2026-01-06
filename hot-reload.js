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
            const state = {
                allEvents: window.allEvents || [],
                activeAlarms: Array.from(window.activeAlarms || new Map()),
                activePendentes: Array.from(window.activePendentes || new Map()),
                currentClientId: window.currentClientId || null,
                selectedEvent: window.selectedEvent || null,
                selectedUnit: document.getElementById('unit-select')?.value || null,
                autoUpdate: document.getElementById('auto-update')?.checked || false,
                currentUser: window.currentUser || null
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
            const hasEvents = Array.isArray(state.allEvents) && state.allEvents.length > 0;
            const hasAlarms = Array.isArray(state.activeAlarms) && state.activeAlarms.length > 0;
            const hasPend = Array.isArray(state.activePendentes) && state.activePendentes.length > 0;

            if (state.currentUser) {
                window.currentUser = state.currentUser;
                if (window.authManager) {
                    window.authManager.renderUser?.();
                    window.authManager.hide?.();
                }
            }

            // Só restaura coleções se vierem com dados
            if (hasEvents && window.allEvents) {
                window.allEvents.length = 0;
                window.allEvents.push(...state.allEvents);
            }
            
            if (hasAlarms && window.activeAlarms) {
                window.activeAlarms.clear();
                state.activeAlarms.forEach(([key, value]) => {
                    window.activeAlarms.set(key, value);
                });
            }
            
            if (hasPend && window.activePendentes) {
                window.activePendentes.clear();
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

            if (window.updateCounts) window.updateCounts();
            if (window.updateEventList) window.updateEventList();

            console.log('✅ Estado restaurado:', (window.allEvents?.length || 0), 'eventos');

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

        this.saveState();

        await new Promise(resolve => setTimeout(resolve, 100));

        window.location.reload();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.hotReload = new HotReload();
    });
} else {
    window.hotReload = new HotReload();
}

window.addEventListener('load', () => {
    if (window.hotReload) {
        setTimeout(() => {
            window.hotReload.restoreState();
        }, 500);
    }
});