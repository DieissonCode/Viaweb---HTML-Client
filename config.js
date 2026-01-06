// config.js
(function() {
    'use strict';

    const CHAVE = "94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD";
    const IV = "70FC01AA8FCA3900E384EA28A5B7BCEF";
    const partitionNames = {
        1: "Balança",
        2: "Administrativo",
        3: "Defensivos",
        4: "Fertilizantes",
        5: "Loja",
        6: "Supermercado",
        7: "AFC",
        8: "Casa"
    };
    const armDisarmCodes = [
        "1401","3401",
        "1402","3402",
        "1403","3403",
        "3456"];
    const falhaCodes = ["1142","1143","1144","1300","1301","1302","1321","1333","1350","1351","1381","1382","1383","1384","1385","1386"];
    const sistemaCodes = falhaCodes.concat(["3142","3143","3144","3300","3301","3302","3321","3333","3351","3381","3382","3383","3384","3385","3386"]);
    const eventosDB = {
        "1130": "Disparo",
        "3130": "Restauro",

        "1140": "Disparo",
        "3140": "Restauro",

        "1100": "Emergência Médica", "1110": "Incêndio", "1120": "Emergência Silenciosa", "1121": "Coação",

        "1144": "Violação de Tamper",
        "3144": "Restauro de Tamper",

        "1300": "Falha de Fonte Auxiliar",
        "3300": "Restauro de Fonte Auxiliar",

        "1301": "Falha de Energia Elétrica", 
        "3301": "Restauro de Energia Elétrica",

        "1302": "Falha de Bateria",
        "3302": "Restauro de Falha de Bateria",

        "1333": "Falha de Tensão no Barramento",
        "3333": "Restauro de Falha de Tensão no Barramento",

        "1321": "Falha de Sirene 1",
        "3321": "Restauro de Sirene 1",

        "1143": "Falha de Módulo Expansor",
        "3143": "Restauro de Módulo Expansor",

        "1350": "Falha de Comunicação",
        "3350": "Restauro de Comunicação",

        "1351": "Falha de Linha Telefônica",
        "3351": "Restauro de Linha Telefônica",

        "1142": "Curto circuito no sensor",
        "3142": "Restauro de Curto Circuito",


        "1401": "Desarmado",
        "3401": "Armado",

        "1402": "Desarmado",
        "3402": "Armado",

        "3403": "Auto Ativação", "1410": "Acesso via Cabo Serial", "3456": "Armado Forçado", "1570": "Inibido sensor",
        "1412": "Acesso remoto VIAWEB", "3407": "Programação lacrada (nível)", "3408": "Programação liberada (nível)",
        "1602": "Teste Automático", "1603": "Teste Internet", "1384": "Falha de bateria sensor sem fio", "1386": "Falha de bateria controle remoto",


        "1381": "Falha supervisão sensor sem fio",
        "3381": "Restauro supervisão sensor sem fio",

        "1382": "Falha supervisão dispositivo sem fio",
        "3382": "Restauro supervisão dispositivo sem fio",

        "1383": "Falha supervisão controle remoto",

        "3384": "Restauro bateria sensor sem fio",

        "1385": "Falha de bateria dispositivo sem fio",

        "3386": "Restauro bateria controle remoto",

        "3385": "Restauro bateria dispositivo sem fio",

        "3383": "Restauro supervisão controle remoto",

        "0000": "Evento Não Cadastrado",

        "AA0": "Servidor VIAWEB iniciado",
        "AA1": "Servidor VIAWEB parado",
        "AA5": "Cliente solicita autorização",

        "3AA6": "Alarme online",
        "1AA6": "Alarme offline"
    };

    window.ViawebConfig = {
        CHAVE,
        IV,
        partitionNames,
        armDisarmCodes,
        falhaCodes,
        sistemaCodes,
        eventosDB
    };
})();