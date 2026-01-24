DEBUG_HOT_RELOAD = 0 // 1 = ATIVADO | 2 = DESATIVADO

class HotReload {
    constructor(checkInterval = 2000) {
    this.checkInterval = checkInterval;
    this.lastModified = null;
    this.isReloading = false;
    this.jsFiles = ['main.js', 'config.js', 'crypto.js', 'units-db.js', 'users-db.js'];
    this.cssFiles = ['styles.css']; // ✅ NOVO
    this.jsLastMod = new Map();
    this.cssLastMod = new Map(); // ✅ NOVO
    
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
        DEBUG_HOT_RELOAD && console.log('🔄 Hot Reload ativado');
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
            } else if (lastMod !== this.lastModified) {
                DEBUG_HOT_RELOAD && console.log('🔄 Mudança detectada no HTML');
                this.lastModified = lastMod;
                await this.reload();
                return;
            }
            
            for (const file of this.jsFiles) {
                const jsResp = await fetch(`/${file}`, {
                    method: 'HEAD',
                    cache: 'no-cache'
                });
                
                const jsLastMod = jsResp.headers.get('Last-Modified');
                
                if (!this.jsLastMod.has(file)) {
                    this.jsLastMod.set(file, jsLastMod);
                } else if (this.jsLastMod.get(file) !== jsLastMod) {
                    DEBUG_HOT_RELOAD && console.log(`🔄 Mudança detectada em ${file}`);
                    this.jsLastMod.set(file, jsLastMod);
                    await this.reload();
                    return;
                }
            }
            
            // ✅ NOVO: verifica CSS
            for (const file of this.cssFiles) {
                const cssResp = await fetch(`/${file}`, {
                    method: 'HEAD',
                    cache: 'no-cache'
                });
                
                const cssLastMod = cssResp.headers.get('Last-Modified');
                
                if (!this.cssLastMod.has(file)) {
                    this.cssLastMod.set(file, cssLastMod);
                } else if (this.cssLastMod.get(file) !== cssLastMod) {
                    DEBUG_HOT_RELOAD && console.log(`🔄 Mudança detectada em ${file}`);
                    this.cssLastMod.set(file, cssLastMod);
                    await this.reload();
                    return;
                }
            }
        } catch (err) {
            // Silencioso
        }
    }

    saveState() {
        try {
            const state = {
                currentClientId: window.currentClientId || null,
                selectedEvent: window.selectedEvent || null,
                selectedUnit: document.getElementById('unit-select')?.value || null,
                autoUpdate: document.getElementById('auto-update')?.checked || false,
                currentUser: window.currentUser || null
            };
            
            sessionStorage.setItem('viawebState', JSON.stringify(state));
            DEBUG_HOT_RELOAD && console.log('💾 Estado salvo (sem eventos)');
        } catch (err) {
            DEBUG_HOT_RELOAD && console.error('❌ Erro ao salvar estado:', err);
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

            DEBUG_HOT_RELOAD && console.log('✅ Estado restaurado (sem eventos)');
            sessionStorage.removeItem('viawebState');
            return true;
        } catch (err) {
            DEBUG_HOT_RELOAD && console.error('❌ Erro ao restaurar estado:', err);
            return false;
        }
    }

    async reload() {
        if (this.isReloading) return;
        this.isReloading = true;

        DEBUG_HOT_RELOAD && console.log('🔄 Recarregando página...');
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