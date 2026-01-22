// auth-manager.js - Gerenciador de autenticação
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.overlay = document.getElementById('auth-overlay');
        this.usernameInput = document.getElementById('auth-username');
        this.passwordInput = document.getElementById('auth-password');
        this.submitBtn = document.getElementById('auth-submit-btn');
        this.cancelBtn = document.getElementById('auth-cancel-btn');
        this.errorDiv = document.getElementById('auth-error');
        this.loginBtn = document.getElementById('login-btn');
        
        // Suporte para ambos os locais (compatibilidade)
        this.userLabel = document.getElementById('auth-user-label-inline') || document.getElementById('auth-user-label');
        this.logoutBtn = document.getElementById('auth-logout-btn-inline') || document.getElementById('auth-logout-btn');

        this.init();
    }

    init() {
        // Event listeners
        this.loginBtn?.addEventListener('click', () => this.show());
        this.submitBtn?.addEventListener('click', () => this.handleLogin());
        this.cancelBtn?.addEventListener('click', () => this.hide());
        this.logoutBtn?.addEventListener('click', () => this.handleLogout());

        // Enter key no modal
        this.passwordInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Click fora do modal fecha
        this.overlay?.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        // ESC fecha modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.style.display === 'flex') {
                this.hide();
            }
        });

        // Restaurar sessão se existir
        this.restoreSession();
    }

    show() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
            this.usernameInput.focus();
            this.clearError();
            this.usernameInput.value = '';
            this.passwordInput.value = '';
            
            // ✅ Pausa atualização automática de status
            if (window.statusUpdateInterval) {
                clearInterval(window.statusUpdateInterval);
                window.statusUpdateInterval = null;
                console.log('⏸️ Auto-update pausado durante login');
            }
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
            this.clearError();
            
            // ✅ Retoma atualização automática de status
            if (this.currentUser) {
                console.log('▶️ Retomando auto-update após login');
                if (typeof startStatusAutoUpdate === 'function') {
                    startStatusAutoUpdate();
                }
            }
        }
    }

    showError(message) {
        if (this.errorDiv) {
            this.errorDiv.textContent = message;
            this.errorDiv.style.display = 'block';
        }
    }

    clearError() {
        if (this.errorDiv) {
            this.errorDiv.textContent = '';
            this.errorDiv.style.display = 'none';
        }
    }

    async handleLogin() {
        const username = this.usernameInput?.value.trim();
        const password = this.passwordInput?.value;

        if (!username || !password) {
            this.showError('Preencha usuário e senha');
            return;
        }

        // Desabilita botão durante requisição
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = '⏳ Autenticando...';
        this.clearError();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.saveSession();
                this.renderUser();
                this.hide();
                console.log('✅ Login realizado:', this.currentUser.displayName);
            } else {
                this.showError(data.error || 'Credenciais inválidas');
            }
        } catch (err) {
            console.error('❌ Erro no login:', err);
            this.showError('Erro ao conectar com servidor');
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = '✅ Entrar';
        }
    }

    handleLogout() {
        this.currentUser = null;
        this.clearSession();
        this.renderUser();
        console.log('🚪 Logout realizado');
    }

    renderUser() {
        if (this.currentUser) {
            this.userLabel.textContent = `Usuário: ${this.currentUser.displayName}`;
            this.logoutBtn.style.display = 'inline-block';
            this.loginBtn.style.display = 'none';

            // Expor globalmente para uso no hot-reload e outras funcionalidades
            window.currentUser = this.currentUser;
        } else {
            this.userLabel.textContent = 'Usuário: Não autenticado';
            this.logoutBtn.style.display = 'none';
            this.loginBtn.style.display = 'inline-flex';

            // Limpar variável global
            window.currentUser = null;
        }

        // Notificar mudança de estado
        if (this.onAuthStateChanged) {
            this.onAuthStateChanged(this.currentUser);
        }
    }

    saveSession() {
        try {
            sessionStorage.setItem('viawebUser', JSON.stringify(this.currentUser));
        } catch (err) {
            console.error('❌ Erro ao salvar sessão:', err);
        }
    }

    clearSession() {
        try {
            sessionStorage.removeItem('viawebUser');
        } catch (err) {
            console.error('❌ Erro ao limpar sessão:', err);
        }
    }

    restoreSession() {
        try {
            const saved = sessionStorage.getItem('viawebUser');
            if (saved) {
                this.currentUser = JSON.parse(saved);
                this.renderUser();
                console.log('✅ Sessão restaurada:', this.currentUser.displayName);
            }
        } catch (err) {
            console.error('❌ Erro ao restaurar sessão:', err);
            this.clearSession();
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.authManager = new AuthManager();
    });
} else {
    window.authManager = new AuthManager();
}