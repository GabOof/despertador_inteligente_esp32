require("dotenv").config();

const express = require("express");

const mqttLib = require("mqtt");

const { createClient } = require("redis");

const { randomUUID } = require("crypto");

const fs = require("fs");

const path = require("path");

// =====================================================
// CONFIGURACAO
// =====================================================

const PORT = Number(process.env.API_PORT || 3000);

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// REDIS
// =====================================================

const redis = createClient({
    url: process.env.REDIS_URL,
});

redis.on("error", (erro) => console.log("[REDIS]", erro.message));

// =====================================================
// MQTT
// =====================================================

let mqtt = null;

const TOPICO_TELEMETRIA = "despertador/gab/+/telemetria";

const TOPICO_ESTADO = "despertador/gab/+/estado";

// =====================================================
// CHAVES REDIS
// =====================================================

function chaves(deviceId) {
    const base = `iot:device:${deviceId}`;

    return {
        estado: `${base}:state`,

        telemetria: `${base}:telemetry`,

        historico: `${base}:history`,

        ultimoContato: `${base}:lastSeen`,

        presenca: `${base}:presence`,

        comando: (id) => `${base}:command:${id}`,
    };
}

// =====================================================
// CONVERTER OBJETO PARA HASH REDIS
// =====================================================

function paraHash(objeto) {
    const resultado = {};

    for (const [chave, valor] of Object.entries(objeto)) {
        if (valor !== undefined && valor !== null) {
            resultado[chave] = String(valor);
        }
    }

    return resultado;
}

// =====================================================
// CONVERTER HASH REDIS PARA JSON
// =====================================================

function normalizar(objeto) {
    const resultado = {};

    for (const [chave, valor] of Object.entries(objeto)) {
        if (valor === "true") {
            resultado[chave] = true;
        } else if (valor === "false") {
            resultado[chave] = false;
        } else if (/^-?\d+(\.\d+)?$/.test(valor)) {
            resultado[chave] = Number(valor);
        } else {
            resultado[chave] = valor;
        }
    }

    return resultado;
}

// =====================================================
// LOG
// =====================================================

function registrarLog(tipo, dados) {
    const pasta = path.join(__dirname, "logs");

    fs.mkdirSync(pasta, {
        recursive: true,
    });

    const registro = {
        data: new Date().toISOString(),

        tipo,

        ...dados,
    };

    fs.appendFileSync(
        path.join(pasta, "eventos.log"),

        JSON.stringify(registro) + "\n"
    );
}

// =====================================================
// PRESENCA
// =====================================================

async function atualizarPresenca(deviceId) {
    const k = chaves(deviceId);

    const agora = new Date().toISOString();

    await redis.set(k.ultimoContato, agora);

    // Se ficar 30 segundos sem mensagens,
    // o dispositivo passa a ser offline.
    await redis.set(k.presenca, "online", {
        EX: 30,
    });
}

// =====================================================
// IDENTIFICAR TOPICO
// =====================================================

function interpretarTopico(topico) {
    const partes = topico.split("/");

    if (partes.length !== 4 || partes[0] !== "despertador" || partes[1] !== "gab") {
        return null;
    }

    return {
        deviceId: partes[2],

        tipo: partes[3],
    };
}

// =====================================================
// VALIDACOES SIMPLES
// =====================================================

function telemetriaValida(dados) {
    return (
        typeof dados.movimento === "boolean" &&
        typeof dados.alarmeAtivo === "boolean" &&
        typeof dados.rssi === "number"
    );
}

function estadoValido(dados) {
    return (
        typeof dados.requestId === "string" &&
        typeof dados.comando === "string" &&
        typeof dados.executado === "boolean" &&
        typeof dados.alarmeAtivo === "boolean"
    );
}

// =====================================================
// SALVAR TELEMETRIA
// =====================================================

async function salvarTelemetria(deviceId, dados) {
    const k = chaves(deviceId);

    const registro = {
        ...dados,

        recebidoEm: new Date().toISOString(),
    };

    // Última telemetria
    await redis.hSet(k.telemetria, paraHash(registro));

    // Histórico:
    // mais recente fica primeiro.
    await redis.lPush(k.historico, JSON.stringify(registro));

    // Mantém somente 100 registros.
    await redis.lTrim(k.historico, 0, 99);

    await atualizarPresenca(deviceId);
}

// =====================================================
// SALVAR ESTADO CONFIRMADO
// =====================================================

async function salvarEstado(deviceId, dados) {
    const k = chaves(deviceId);

    await redis.hSet(
        k.estado,
        paraHash({
            ...dados,

            confirmadoEm: new Date().toISOString(),
        })
    );

    await atualizarPresenca(deviceId);

    // Se começa com cmd-, foi um
    // comando enviado pelo sistema web.
    if (dados.requestId.startsWith("cmd-")) {
        await redis.hSet(
            k.comando(dados.requestId),

            paraHash({
                status: dados.executado ? "confirmado" : "rejeitado",

                executado: dados.executado,

                alarmeAtivo: dados.alarmeAtivo,

                comando: dados.comando,

                confirmadoEm: new Date().toISOString(),
            })
        );
    }
}

// =====================================================
// RECEBER MQTT
// =====================================================

async function processarMQTT(topico, buffer) {
    const info = interpretarTopico(topico);

    if (!info) return;

    let dados;

    try {
        dados = JSON.parse(buffer.toString());
    } catch {
        registrarLog("invalida", {
            topico,
            erro: "JSON invalido",
        });

        return;
    }

    // ---------------------------------------------
    // TELEMETRIA
    // ---------------------------------------------

    if (info.tipo === "telemetria") {
        if (!telemetriaValida(dados)) {
            registrarLog("invalida", {
                topico,
                dados,
            });

            return;
        }

        await salvarTelemetria(info.deviceId, dados);

        registrarLog("telemetria", {
            deviceId: info.deviceId,
        });

        console.log(`[TELEMETRIA] ${info.deviceId}`);

        return;
    }

    // ---------------------------------------------
    // ESTADO / CONFIRMACAO
    // ---------------------------------------------

    if (info.tipo === "estado") {
        if (!estadoValido(dados)) {
            registrarLog("invalida", {
                topico,
                dados,
            });

            return;
        }

        await salvarEstado(info.deviceId, dados);

        registrarLog("estado", {
            deviceId: info.deviceId,

            requestId: dados.requestId,

            comando: dados.comando,
        });

        if (dados.requestId.startsWith("cmd-")) {
            console.log(`[CONFIRMADO] ${dados.comando}`);
        }
    }
}

// =====================================================
// CONECTAR MQTT
// =====================================================

function conectarMQTT() {
    mqtt = mqttLib.connect(`mqtts://${process.env.MQTT_HOST}:${process.env.MQTT_PORT || 8883}`, {
        username: process.env.MQTT_USERNAME,

        password: process.env.MQTT_PASSWORD,

        clientId: "backend-despertador-gab",

        rejectUnauthorized: true,

        reconnectPeriod: 5000,
    });

    mqtt.on("connect", () => {
        console.log("[OK] MQTT conectado");

        mqtt.subscribe([TOPICO_TELEMETRIA, TOPICO_ESTADO]);
    });

    mqtt.on("message", (topico, mensagem) => {
        processarMQTT(topico, mensagem).catch((erro) => console.log("[ERRO MQTT]", erro.message));
    });
}

// =====================================================
// API - ESTADO ATUAL
// =====================================================

app.get(
    "/api/devices/:deviceId/state",

    async (req, res) => {
        try {
            const deviceId = req.params.deviceId;

            const k = chaves(deviceId);

            const estado = await redis.hGetAll(k.estado);

            const telemetria = await redis.hGetAll(k.telemetria);

            if (!Object.keys(estado).length && !Object.keys(telemetria).length) {
                return res.status(404).json({
                    erro: "Dispositivo nao encontrado",
                });
            }

            res.json({
                deviceId,

                estado: normalizar(estado),

                telemetria: normalizar(telemetria),
            });
        } catch {
            res.status(503).json({
                erro: "Redis indisponivel",
            });
        }
    }
);

// =====================================================
// API - HISTORICO
// =====================================================

app.get(
    "/api/devices/:deviceId/history",

    async (req, res) => {
        try {
            const limite = Number(req.query.limit || 10);

            if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
                return res.status(400).json({
                    erro: "Limit deve estar entre 1 e 100",
                });
            }

            const k = chaves(req.params.deviceId);

            const itens = await redis.lRange(k.historico, 0, limite - 1);

            res.json({
                deviceId: req.params.deviceId,

                historico: itens.map(JSON.parse),
            });
        } catch {
            res.status(503).json({
                erro: "Redis indisponivel",
            });
        }
    }
);

// =====================================================
// API - PRESENCA
// =====================================================

app.get(
    "/api/devices/:deviceId/presence",

    async (req, res) => {
        try {
            const k = chaves(req.params.deviceId);

            const ultimoContato = await redis.get(k.ultimoContato);

            if (!ultimoContato) {
                return res.status(404).json({
                    erro: "Dispositivo nao encontrado",
                });
            }

            const presenca = await redis.get(k.presenca);

            res.json({
                deviceId: req.params.deviceId,

                presenca: presenca || "offline",

                ultimoContato,
            });
        } catch {
            res.status(503).json({
                erro: "Redis indisponivel",
            });
        }
    }
);

// =====================================================
// API - ENVIAR COMANDO
// =====================================================

app.post(
    "/api/devices/:deviceId/commands",

    async (req, res) => {
        const comandos = ["ligar_alarme", "desligar_alarme", "automatico"];

        const comando = req.body.comando;

        if (!comandos.includes(comando)) {
            return res.status(400).json({
                erro: "Comando invalido",
            });
        }

        if (!mqtt || !mqtt.connected) {
            return res.status(503).json({
                erro: "MQTT indisponivel",
            });
        }

        try {
            const deviceId = req.params.deviceId;

            const requestId = `cmd-${randomUUID()}`;

            const k = chaves(deviceId);

            const topico = `despertador/gab/${deviceId}/comando`;

            const mensagem = JSON.stringify({
                requestId,
                comando,
            });

            // Primeiro fica como enviado.
            await redis.hSet(
                k.comando(requestId),

                paraHash({
                    requestId,
                    comando,
                    status: "enviado",

                    enviadoEm: new Date().toISOString(),
                })
            );

            await new Promise((resolve, reject) => {
                mqtt.publish(
                    topico,
                    mensagem,
                    {
                        qos: 1,
                    },

                    (erro) => {
                        if (erro) reject(erro);
                        else resolve();
                    }
                );
            });

            console.log(`[ENVIADO] ${comando}`);

            res.status(202).json({
                requestId,
                comando,
                status: "enviado",
            });
        } catch {
            res.status(503).json({
                erro: "Falha ao enviar comando",
            });
        }
    }
);

// =====================================================
// API - STATUS DO COMANDO
// =====================================================

app.get(
    "/api/devices/:deviceId/commands/:requestId",

    async (req, res) => {
        try {
            const k = chaves(req.params.deviceId);

            const comando = await redis.hGetAll(k.comando(req.params.requestId));

            if (!Object.keys(comando).length) {
                return res.status(404).json({
                    erro: "Comando nao encontrado",
                });
            }

            res.json(normalizar(comando));
        } catch {
            res.status(503).json({
                erro: "Redis indisponivel",
            });
        }
    }
);

// =====================================================
// INICIAR SISTEMA
// =====================================================

async function iniciar() {
    await redis.connect();

    console.log("[OK] Redis conectado");

    conectarMQTT();

    app.listen(PORT, () => {
        console.log(`[OK] Sistema Web: http://localhost:${PORT}`);
    });
}

iniciar().catch((erro) => {
    console.error("[ERRO]", erro.message);
});
