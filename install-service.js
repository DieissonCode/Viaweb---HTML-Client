// install-service.js - Instala servidor como serviço Windows
const Service = require('node-windows').Service;
const path = require('path');

// Criar objeto de serviço
const svc = new Service({
    name: 'Viaweb Cotrijal',
    description: 'Sistema de monitoramento de alarmes Viaweb - Cotrijal',
    script: path.join(__dirname, 'server.js'),
    nodeOptions: [
        '--max_old_space_size=2048'
    ],
    env: [
        {
            name: "NODE_ENV",
            value: "production"
        }
    ],
    // Configurações de log
    logpath: path.join(__dirname, 'logs'),
    logmode: 'rotate',
    // Reiniciar em caso de falha
    grow: 0.5,
    wait: 1,
    maxRestarts: 10,
    abortOnError: false,
    // Iniciar automaticamente
    startOnBoot: true
});

// Eventos de instalação
svc.on('install', () => {
    console.log('✅ Serviço instalado com sucesso!');
    console.log('🚀 Iniciando serviço...');
    svc.start();
});

svc.on('alreadyinstalled', () => {
    console.log('⚠️  Serviço já está instalado');
});

svc.on('start', () => {
    console.log('✅ Serviço iniciado com sucesso!');
    console.log('\n📋 Informações do Serviço:');
    console.log(`   Nome: ${svc.name}`);
    console.log(`   Script: ${svc.script}`);
    console.log(`   Logs: ${svc.logpath}`);
    console.log('\n💡 Comandos úteis:');
    console.log('   services.msc - Gerenciador de Serviços Windows');
    console.log('   node uninstall-service.js - Desinstalar serviço');
});

svc.on('error', (err) => {
    console.error('❌ Erro no serviço:', err);
});

// Instalar serviço
console.log('📦 Instalando serviço Windows...');
svc.install();
