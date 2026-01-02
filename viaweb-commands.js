// viaweb-commands.js - Comandos do protocolo Viaweb (compatível com browser e ESM)

// Comando para buscar partições
function getPartitionsCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP,
            comando: [{ cmd: "particoes" }]
        }]
    };
}

// Comando para buscar zonas
function getZonesCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP,
            comando: [{ cmd: "zonas" }]
        }]
    };
}

// Armar partições
function armPartitionsCommand(idISEP, particoes, zonas = [], password = 8790, commandId = Date.now()) {
    const comando = { cmd: "armar", password, particoes };
    if (zonas.length > 0) comando.inibir = zonas;
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP,
            comando: [comando]
        }]
    };
}

// Desarmar partições
function disarmPartitionsCommand(idISEP, particoes, password = 8790, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP,
            comando: [{ cmd: "desarmar", password, particoes }]
        }]
    };
}

// IDENT
function createIdentCommand(nome = "Bridge Node.js", serializado = 1, retransmite = 60, limite = 0) {
    const randomNum = Math.floor(Math.random() * 999999) + 1;
    return {
        a: randomNum,
        oper: [{
            id: "ident-1",
            acao: "ident",
            nome,
            serializado,
            retransmite,
            limite
        }]
    };
}

// Status
function getStatusCommand(idISEP, commandId = Date.now()) {
    return {
        oper: [{
            id: commandId,
            acao: "executar",
            idISEP,
            comando: [{ cmd: "status" }]
        }]
    };
}

// ACK
function createAckCommand(eventId) {
    return { resp: [{ id: eventId }] };
}

// Agrupa comandos iniciais
function getInitialDataCommands(idISEP) {
    const partitionsId = Date.now();
    const zonesId = partitionsId + 1;
    return {
        partitions: { id: partitionsId, command: getPartitionsCommand(idISEP, partitionsId) },
        zones: { id: zonesId, command: getZonesCommand(idISEP, zonesId) }
    };
}

// Valida ISEP (4 hex)
function isValidISEP(idISEP) {
    if (!idISEP || typeof idISEP !== 'string') return false;
    const cleaned = idISEP.trim().toUpperCase();
    return /^[0-9A-F]{4}$/.test(cleaned);
}

// Formata ISEP sem conversão decimal->hex
function formatISEP(idISEP) {
    if (!idISEP) return null;
    const formatted = String(idISEP).trim().toUpperCase().padStart(4, '0');
    return isValidISEP(formatted) ? formatted : null;
}

/**
 * listarClientes
 * - Se idISEPArray for fornecido (array), filtra pelos ISEP informados.
 * - Se não for fornecido, lista todos os clientes de todos os servidores (conforme doc).
 */
function createListarClientesCommand(idISEPArray = undefined, commandId = Date.now()) {
    const op = {
        id: commandId,
        acao: "listarClientes"
    };
    if (Array.isArray(idISEPArray) && idISEPArray.length > 0) {
        op.idISEP = idISEPArray; // array de strings (hex 4 dígitos)
    }
    return { oper: [op] };
}

const ViawebCommands = {
    getPartitionsCommand,
    getZonesCommand,
    armPartitionsCommand,
    disarmPartitionsCommand,
    createIdentCommand,
    getStatusCommand,
    createAckCommand,
    getInitialDataCommands,
    isValidISEP,
    formatISEP,
    createListarClientesCommand
};

export {
    getPartitionsCommand,
    getZonesCommand,
    armPartitionsCommand,
    disarmPartitionsCommand,
    createIdentCommand,
    getStatusCommand,
    createAckCommand,
    getInitialDataCommands,
    isValidISEP,
    formatISEP,
    createListarClientesCommand
};

if (typeof window !== 'undefined') {
    window.ViawebCommands = ViawebCommands;
}