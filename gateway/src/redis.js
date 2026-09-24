const { createClient } = require("redis");

// =====================================================
// CLIENTE REDIS
// =====================================================

const redis = createClient({
    url: process.env.REDIS_URL,
});

// =====================================================
// EVENTOS
// =====================================================

redis.on("error", (erro) => {
    console.error("Erro no Redis:", erro.message);
});

redis.on("reconnecting", () => {
    console.log("Tentando reconectar ao Redis...");
});

// =====================================================
// CONECTAR
// =====================================================

async function conectarRedis() {
    if (redis.isOpen) {
        return;
    }

    await redis.connect();

    console.log("Redis conectado com sucesso!");
}

// =====================================================
// CONVERTER DADOS PARA HASH
// =====================================================

function prepararHash(dados) {
    const resultado = {};

    for (const [chave, valor] of Object.entries(dados)) {
        if (valor === null || valor === undefined) {
            continue;
        }

        if (typeof valor === "object") {
            resultado[chave] = JSON.stringify(valor);
        } else {
            resultado[chave] = String(valor);
        }
    }

    return resultado;
}

// =====================================================
// NOMES DAS CHAVES
// =====================================================

function criarChaves(deviceId) {
    const prefixo = `iot:device:${deviceId}`;

    return {
        estado: `${prefixo}:state`,

        historico: `${prefixo}:history`,

        ultimoContato: `${prefixo}:lastSeen`,

        presenca: `${prefixo}:presence`,
    };
}

// =====================================================
// PERSISTIR MENSAGEM
// =====================================================

async function persistirMensagem(deviceId, tipo, dados) {
    const agora = new Date().toISOString();

    const chaves = criarChaves(deviceId);

    // ---------------------------------------------
    // ESTADO ATUAL
    // ---------------------------------------------

    const estado = prepararHash({
        ...dados,

        tipoUltimaMensagem: tipo,

        atualizadoEm: agora,
    });

    await redis.hSet(chaves.estado, estado);

    // ---------------------------------------------
    // ULTIMO CONTATO
    // ---------------------------------------------

    await redis.set(chaves.ultimoContato, agora);

    // ---------------------------------------------
    // PRESENCA
    // ---------------------------------------------

    await redis.set(chaves.presenca, "online", {
        EX: 30,
    });

    // ---------------------------------------------
    // HISTORICO
    // ---------------------------------------------

    if (tipo === "telemetria") {
        const registro = {
            deviceId,
            recebidoEm: agora,
            ...dados,
        };

        await redis.rPush(chaves.historico, JSON.stringify(registro));

        // Mantém somente os últimos 100 registros
        await redis.lTrim(chaves.historico, -100, -1);
    }

    console.log(`Dados persistidos no Redis: ${deviceId}`);
}

// =====================================================
// CONSULTAR ESTADO
// =====================================================

async function consultarEstado(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.hGetAll(chaves.estado);
}

// =====================================================
// CONSULTAR HISTORICO
// =====================================================

async function consultarHistorico(deviceId) {
    const chaves = criarChaves(deviceId);

    const registros = await redis.lRange(chaves.historico, 0, -1);

    return registros.map((item) => JSON.parse(item));
}

// =====================================================
// CONSULTAR ULTIMO CONTATO
// =====================================================

async function consultarUltimoContato(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.get(chaves.ultimoContato);
}

// =====================================================
// CONSULTAR PRESENCA
// =====================================================

async function consultarPresenca(deviceId) {
    const chaves = criarChaves(deviceId);

    const valor = await redis.get(chaves.presenca);

    return valor || "offline";
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    conectarRedis,
    persistirMensagem,
    consultarEstado,
    consultarHistorico,
    consultarUltimoContato,
    consultarPresenca,
};
