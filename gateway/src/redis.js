const { createClient } = require("redis");

const redis = createClient({
    url: process.env.REDIS_URL,
});

// =====================================================
// EVENTOS REDIS
// =====================================================

redis.on("error", (erro) => {
    console.error("Erro Redis:", erro.message);
});

redis.on("reconnecting", () => {
    console.log("Tentando reconectar ao Redis...");
});

// =====================================================
// CONEXAO
// =====================================================

async function conectarRedis() {
    if (redis.isOpen) {
        return;
    }

    await redis.connect();

    console.log("Redis conectado com sucesso!");
}

async function desconectarRedis() {
    if (!redis.isOpen) {
        return;
    }

    await redis.quit();
}

// =====================================================
// CHAVES
// =====================================================

function criarChaves(deviceId) {
    const prefixo = `iot:device:${deviceId}`;

    return {
        estado: `${prefixo}:state`,

        telemetriaAtual: `${prefixo}:telemetry`,

        historico: `${prefixo}:history`,

        ultimoContato: `${prefixo}:lastSeen`,

        presenca: `${prefixo}:presence`,

        ultimoComando: `${prefixo}:lastCommand`,

        comandos: `${prefixo}:commands`,

        comando: (requestId) => `${prefixo}:command:${requestId}`,
    };
}

// =====================================================
// PREPARAR HASH
// =====================================================

function prepararHash(dados) {
    const resultado = {};

    for (const [chave, valor] of Object.entries(dados)) {
        if (valor === undefined || valor === null) {
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
// ULTIMO CONTATO
// =====================================================

async function atualizarContato(deviceId, horario) {
    const chaves = criarChaves(deviceId);

    await redis.set(chaves.ultimoContato, horario);

    await redis.set(chaves.presenca, "online", {
        EX: 30,
    });
}

// =====================================================
// TELEMETRIA
// =====================================================

async function persistirTelemetria(deviceId, dados) {
    const agora = new Date().toISOString();

    const chaves = criarChaves(deviceId);

    await redis.hSet(
        chaves.telemetriaAtual,
        prepararHash({
            ...dados,
            recebidoEm: agora,
        })
    );

    const registro = {
        deviceId,

        recebidoEm: agora,

        ...dados,
    };

    await redis.rPush(chaves.historico, JSON.stringify(registro));

    await redis.lTrim(chaves.historico, -100, -1);

    await atualizarContato(deviceId, agora);
}

// =====================================================
// COMANDO ENVIADO
// =====================================================

async function registrarComandoEnviado(deviceId, requestId, comando, topico) {
    const agora = new Date().toISOString();

    const chaves = criarChaves(deviceId);

    const registro = {
        requestId,

        comando,

        status: "enviado",

        enviadoEm: agora,

        topico,
    };

    await redis.hSet(chaves.comando(requestId), prepararHash(registro));

    await redis.hSet(chaves.ultimoComando, prepararHash(registro));

    await redis.rPush(chaves.comandos, requestId);

    await redis.lTrim(chaves.comandos, -50, -1);
}

// =====================================================
// FALHA NA PUBLICACAO
// =====================================================

async function registrarFalhaComando(deviceId, requestId, erro) {
    const agora = new Date().toISOString();

    const chaves = criarChaves(deviceId);

    const atualizacao = {
        requestId,

        status: "falha_publicacao",

        erro,

        falhouEm: agora,
    };

    await redis.hSet(chaves.comando(requestId), prepararHash(atualizacao));

    await redis.hSet(chaves.ultimoComando, prepararHash(atualizacao));
}

// =====================================================
// CONFIRMACAO DO ESP32
// =====================================================

async function persistirConfirmacaoEstado(deviceId, dados) {
    const agora = new Date().toISOString();

    const chaves = criarChaves(deviceId);

    const estadoConfirmado = {
        deviceId,

        requestId: dados.requestId,

        comando: dados.comando,

        executado: dados.executado,

        alarmeAtivo: dados.alarmeAtivo,

        modoAutomatico: dados.modoAutomatico,

        pausaMovimento: dados.pausaMovimento,

        motivo: dados.motivo || "",

        confirmadoEm: agora,
    };

    // Esta chave somente recebe
    // estado publicado pelo ESP32.
    await redis.hSet(chaves.estado, prepararHash(estadoConfirmado));

    await atualizarContato(deviceId, agora);

    const requestId = dados.requestId;

    // Eventos internos nao sao
    // comandos enviados pelo gateway.
    if (requestId === "evento" || requestId === "startup" || requestId === "sem-id") {
        return;
    }

    const status = dados.executado ? "confirmado" : "rejeitado";

    const atualizacao = {
        requestId,

        comando: dados.comando,

        status,

        executado: dados.executado,

        confirmadoEm: agora,

        alarmeAtivo: dados.alarmeAtivo,

        modoAutomatico: dados.modoAutomatico,

        pausaMovimento: dados.pausaMovimento,

        motivo: dados.motivo || "",
    };

    await redis.hSet(chaves.comando(requestId), prepararHash(atualizacao));

    await redis.hSet(chaves.ultimoComando, prepararHash(atualizacao));
}

// =====================================================
// CONSULTAS
// =====================================================

async function consultarEstado(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.hGetAll(chaves.estado);
}

async function consultarTelemetriaAtual(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.hGetAll(chaves.telemetriaAtual);
}

async function consultarHistorico(deviceId, limite = 10) {
    const chaves = criarChaves(deviceId);

    const registros = await redis.lRange(chaves.historico, -Math.abs(limite), -1);

    return registros.map((item) => JSON.parse(item));
}

async function consultarUltimoContato(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.get(chaves.ultimoContato);
}

async function consultarPresenca(deviceId) {
    const chaves = criarChaves(deviceId);

    const valor = await redis.get(chaves.presenca);

    return valor || "offline";
}

async function consultarUltimoComando(deviceId) {
    const chaves = criarChaves(deviceId);

    return await redis.hGetAll(chaves.ultimoComando);
}

async function consultarComando(deviceId, requestId) {
    const chaves = criarChaves(deviceId);

    return await redis.hGetAll(chaves.comando(requestId));
}

async function consultarComandos(deviceId, limite = 10) {
    const chaves = criarChaves(deviceId);

    const ids = await redis.lRange(chaves.comandos, -Math.abs(limite), -1);

    const resultado = [];

    for (const requestId of ids) {
        resultado.push(await consultarComando(deviceId, requestId));
    }

    return resultado;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    conectarRedis,

    desconectarRedis,

    persistirTelemetria,

    registrarComandoEnviado,

    registrarFalhaComando,

    persistirConfirmacaoEstado,

    consultarEstado,

    consultarTelemetriaAtual,

    consultarHistorico,

    consultarUltimoContato,

    consultarPresenca,

    consultarUltimoComando,

    consultarComando,

    consultarComandos,
};
