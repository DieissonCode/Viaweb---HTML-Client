// hot-reload.js - Sistema de hot reload que preserva estado (agora ignorando eventos)
class HotReload {
    constructor(checkInterval = 2000) {
        this.checkInterval = checkInterval;
        this.lastModified = null;
        this.isReloading = false;
        
        // Somente referências de estado que não envolvem eventos
        this.savedState = {
            currentClientId: null,
            selectedEvent: null,
            selectedUnit: null,
            autoUpdate: false,
            currentUser: null
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
                // IGNORANDO eventos
                currentClientId: window.currentClientId || null,
                selectedEvent: window.selectedEvent || null,
                selectedUnit: document.getElementById('unit-select')?.value || null,
                autoUpdate: document.getElementById('auto-update')?.checked || false,
                currentUser: window.currentUser || null
            };
            
            sessionStorage.setItem('viawebState', JSON.stringify(state));
            console.log('💾 Estado salvo (sem eventos)');
        } catch (err) {
            console.error('❌ Erro ao salvar estado:', err);
        }
    }

    restoreState() {
        try {
            const saved = sessionStorage.getItem('viawebState');
            if (!saved) return false;

            const state = JSON.parse(saved);

            if (state.currentUser) {
                window.currentUser = state.currentUser;
                if (window.authManager) {
                    window.authManager.renderUser?.();
                    window.authManager.hide?.();
                }
            }

            // NÃO restaura eventos/alarms/pendentes
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

            console.log('✅ Estado restaurado (sem eventos)');

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