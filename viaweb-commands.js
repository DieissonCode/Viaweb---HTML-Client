// viaweb-commands.js - Comandos do protocolo Viaweb
// Biblioteca de comandos para comunicação com centrais de alarme via protocolo Viaweb

// IMPORTANTE: Os comandos são enviados como JSON e serão criptografados pelo bridge
// O bridge é responsável por criptografar antes de enviar para o servidor TCP

/**
 * Cria comando para buscar partições
 * @param {string} idISEP - ID ISEP da central (4 dígitos hexadecimais)
 * @param {number} commandId - ID único do comando
 * @returns {object} Comando formatado para o protocolo Viaweb
 */
export function getPartitionsCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP: idISEP,
            comando: [{
                cmd: "particoes"
            }]
        }]
    };
}

/**
 * Cria comando para buscar zonas
 * @param {string} idISEP - ID ISEP da central (4 dígitos hexadecimais)
 * @param {number} commandId - ID único do comando
 * @returns {object} Comando formatado para o protocolo Viaweb
 */
export function getZonesCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP: idISEP,
            comando: [{
                cmd: "zonas"
            }]
        }]
    };
}

/**
 * Cria comando para armar partições
 * @param {string} idISEP - ID ISEP da central
 * @param {number[]} particoes - Array com números das partições a armar
 * @param {number[]} zonas - Array com números das zonas a inibir (opcional)
 * @param {number} password - Senha de armação (padrão: 8790)
 * @param {number} commandId - ID único do comando
 * @returns {object} Comando formatado
 */
export function armPartitionsCommand(idISEP, particoes, zonas = [], password = 8790, commandId = Date.now()) {
    const comando = {
        cmd: "armar",
        password: password,
        particoes: particoes
    };
    
    if (zonas.length > 0) {
        comando.inibir = zonas;
    }
    
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP: idISEP,
            comando: [comando]
        }]
    };
}

/**
 * Cria comando para desarmar partições
 * @param {string} idISEP - ID ISEP da central
 * @param {number[]} particoes - Array com números das partições a desarmar
 * @param {number} password - Senha de desarmação (padrão: 8790)
 * @param {number} commandId - ID único do comando
 * @returns {object} Comando formatado
 */
export function disarmPartitionsCommand(idISEP, particoes, password = 8790, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP: idISEP,
            comando: [{
                cmd: "desarmar",
                password: password,
                particoes: particoes
            }]
        }]
    };
}

/**
 * Cria comando de identificação (IDENT)
 * @param {string} nome - Nome do cliente
 * @param {number} serializado - Flag serializado (padrão: 1)
 * @param {number} retransmite - Tempo de retransmissão em segundos (padrão: 60)
 * @param {number} limite - Limite (padrão: 0)
 * @returns {object} Comando IDENT formatado
 */
export function createIdentCommand(nome = "Bridge Node.js", serializado = 1, retransmite = 60, limite = 0) {
    const randomNum = Math.floor(Math.random() * 999999) + 1;
    
    return {
        a: randomNum,
        oper: [{
            id: "ident-1",
            acao: "ident",
            nome: nome,
            serializado: serializado,
            retransmite: retransmite,
            limite: limite
        }]
    };
}

/**
 * Cria comando para buscar status geral
 * @param {string} idISEP - ID ISEP da central
 * @param {number} commandId - ID único do comando
 * @returns {object} Comando formatado
 */
export function getStatusCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP: idISEP,
            comando: [{
                cmd: "status"
            }]
        }]
    };
}

/**
 * Cria ACK (acknowledge) para evento recebido
 * @param {string|number} eventId - ID do evento a confirmar
 * @returns {object} ACK formatado
 */
export function createAckCommand(eventId) {
    return {
        resp: [{
            id: eventId
        }]
    };
}

/**
 * Agrupa comandos de partições e zonas para carregar dados da central
 * @param {string} idISEP - ID ISEP da central (4 dígitos)
 * @returns {object} Objeto com ambos os comandos e seus IDs
 */
export function getInitialDataCommands(idISEP) {
    const partitionsId = Date.now();
    const zonesId = partitionsId + 1;
    
    return {
        partitions: {
            id: partitionsId,
            command: getPartitionsCommand(idISEP, partitionsId)
        },
        zones: {
            id: zonesId,
            command: getZonesCommand(idISEP, zonesId)
        }
    };
}

/**
 * Valida se o ID ISEP está no formato correto (4 dígitos hexadecimais)
 * @param {string} idISEP - ID a validar
 * @returns {boolean} True se válido
 */
export function isValidISEP(idISEP) {
    if (!idISEP || typeof idISEP !== 'string') return false;
    
    // Remove espaços e converte para maiúsculas
    const cleaned = idISEP.trim().toUpperCase();
    
    // Verifica se tem 4 caracteres hexadecimais
    return /^[0-9A-F]{4}$/.test(cleaned);
}

/**
 * Formata ID ISEP para o padrão correto (4 dígitos hex)
 * ⚠️ IMPORTANTE: NÃO FAZ CONVERSÃO DECIMAL->HEX
 * Apenas garante 4 dígitos com padding de zeros
 * @param {string|number} idISEP - ID a formatar
 * @returns {string} ID formatado ou null se inválido
 */
export function formatISEP(idISEP) {
    if (!idISEP) return null;
    
    // Converte para string e remove espaços
    let formatted = String(idISEP).trim().toUpperCase();
    
    // ⚠️ SEM CONVERSÃO DECIMAL->HEX!
    // Apenas adiciona zeros à esquerda se necessário
    formatted = formatted.padStart(4, '0');
    
    console.log(`[ISEP] ID recebido: ${idISEP} -> Formatado: ${formatted} (SEM CONVERSÃO)`);
    
    if (isValidISEP(formatted)) {
        console.log(`[ISEP] ID válido: ${formatted}`);
        return formatted;
    } else {
        console.error(`[ISEP] ID inválido: ${formatted}`);
        return null;
    }
}