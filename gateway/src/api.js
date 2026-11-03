require("dotenv").config();

const path = require("path");

const express = require("express");

const cors = require("cors");

const {
    conectarRedis,
    desconectarRedis,
    consultarEstado,
    consultarTelemetriaAtual,
    consultarHistorico,
    consultarUltimoContato,
    consultarPresenca,
    consultarComando,
} = require("./redis");

const {
    iniciarPublicadorMQTT,
    publicarComando,
    mqttDisponivel,
    encerrarPublicadorMQTT,
} = require("./commandPublisher");

// =====================================================
// CONFIGURACAO
// =====================================================

const app = express();

const PORT = Number(process.env.API_PORT || 3000);

// =====================================================
// MIDDLEWARES
// =====================================================

app.use(cors());

app.use(express.json());

// =====================================================
// FRONTEND
// =====================================================

app.use(express.static(path.join(__dirname, "../public")));

// =====================================================
// FUNCOES AUXILIARES
// =====================================================

function objetoVazio(objeto) {
    return !objeto || Object.keys(objeto).length === 0;
}

function erroRedis(res, erro) {
    console.error("[ERRO REDIS]", erro.message);

    return res.status(503).json({
        sucesso: false,

        erro: "redis_indisponivel",

        mensagem: "Nao foi possivel acessar o Redis.",
    });
}

// =====================================================
// HEALTH
// =====================================================

app.get(
    "/api/health",

    (req, res) => {
        return res.status(200).json({
            sucesso: true,

            api: "online",

            mqtt: mqttDisponivel() ? "online" : "offline",

            timestamp: new Date().toISOString(),
        });
    }
);

// =====================================================
// ESTADO ATUAL
// =====================================================

app.get(
    "/api/devices/:deviceId/state",

    async (req, res) => {
        const { deviceId } = req.params;

        try {
            const estado = await consultarEstado(deviceId);

            const telemetria = await consultarTelemetriaAtual(deviceId);

            if (objetoVazio(estado) && objetoVazio(telemetria)) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "dispositivo_nao_encontrado",

                    mensagem: "Nenhum dado encontrado para o dispositivo.",
                });
            }

            return res.status(200).json({
                sucesso: true,

                deviceId,

                estadoConfirmado: estado,

                telemetriaAtual: telemetria,
            });
        } catch (erro) {
            return erroRedis(res, erro);
        }
    }
);

// =====================================================
// HISTORICO
// =====================================================

app.get(
    "/api/devices/:deviceId/history",

    async (req, res) => {
        const { deviceId } = req.params;

        const limite = Number(req.query.limit || 20);

        if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
            return res.status(400).json({
                sucesso: false,

                erro: "parametro_invalido",

                mensagem: "limit deve ser um inteiro entre 1 e 100.",
            });
        }

        try {
            const historico = await consultarHistorico(deviceId, limite);

            if (historico.length === 0) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "historico_vazio",

                    mensagem: "Nenhuma telemetria encontrada.",
                });
            }

            return res.status(200).json({
                sucesso: true,

                deviceId,

                quantidade: historico.length,

                historico,
            });
        } catch (erro) {
            return erroRedis(res, erro);
        }
    }
);

// =====================================================
// PRESENCA
// =====================================================

app.get(
    "/api/devices/:deviceId/presence",

    async (req, res) => {
        const { deviceId } = req.params;

        try {
            const ultimoContato = await consultarUltimoContato(deviceId);

            if (!ultimoContato) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "dispositivo_nao_encontrado",

                    mensagem: "O dispositivo ainda nao possui registros.",
                });
            }

            const presenca = await consultarPresenca(deviceId);

            return res.status(200).json({
                sucesso: true,

                deviceId,

                presenca,

                ultimoContato,
            });
        } catch (erro) {
            return erroRedis(res, erro);
        }
    }
);

// =====================================================
// ENVIAR COMANDO
//
// POST /api/devices/esp32-01/commands
//
// {
//     "comando": "ligar_alarme"
// }
// =====================================================

app.post(
    "/api/devices/:deviceId/commands",

    async (req, res) => {
        const { deviceId } = req.params;

        const { comando } = req.body;

        const comandosPermitidos = ["ligar_alarme", "desligar_alarme", "automatico"];

        if (!comando || typeof comando !== "string") {
            return res.status(400).json({
                sucesso: false,

                erro: "comando_invalido",

                mensagem: "Informe o comando.",
            });
        }

        if (!comandosPermitidos.includes(comando)) {
            return res.status(400).json({
                sucesso: false,

                erro: "comando_nao_suportado",

                mensagem: "Comando nao suportado.",
            });
        }

        if (!mqttDisponivel()) {
            return res.status(503).json({
                sucesso: false,

                erro: "mqtt_indisponivel",

                mensagem: "Nao foi possivel enviar o comando.",
            });
        }

        try {
            const resultado = await publicarComando(deviceId, comando);

            /*
                202 Accepted:

                o comando foi aceito e
                enviado, mas ainda nao
                necessariamente executado.
            */

            return res.status(202).json({
                sucesso: true,

                mensagem: "Comando enviado. Aguardando confirmacao do ESP32.",

                ...resultado,
            });
        } catch (erro) {
            console.error("[ERRO COMANDO]", erro.message);

            return res.status(503).json({
                sucesso: false,

                erro: "falha_envio",

                mensagem: "Falha ao publicar o comando MQTT.",
            });
        }
    }
);

// =====================================================
// CONSULTAR STATUS DO COMANDO
//
// GET
// /api/devices/:deviceId/commands/:requestId
// =====================================================

app.get(
    "/api/devices/:deviceId/commands/:requestId",

    async (req, res) => {
        const { deviceId, requestId } = req.params;

        try {
            const comando = await consultarComando(deviceId, requestId);

            if (objetoVazio(comando)) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "comando_nao_encontrado",

                    mensagem: "O comando solicitado nao existe.",
                });
            }

            return res.status(200).json({
                sucesso: true,

                deviceId,

                comando,
            });
        } catch (erro) {
            return erroRedis(res, erro);
        }
    }
);

// =====================================================
// API 404
// =====================================================

app.use(
    "/api",

    (req, res) => {
        return res.status(404).json({
            sucesso: false,

            erro: "rota_nao_encontrada",

            mensagem: "Endpoint inexistente.",
        });
    }
);

// =====================================================
// INICIAR
// =====================================================

async function iniciar() {
    console.clear();

    console.log("Despertador Inteligente");

    console.log();

    try {
        await conectarRedis();

        console.log("[OK] Redis conectado");

        iniciarPublicadorMQTT();

        app.listen(
            PORT,

            () => {
                console.log(`[OK] Web/API: http://localhost:${PORT}`);
            }
        );
    } catch (erro) {
        console.error("[ERRO]", erro.message);

        process.exit(1);
    }
}

// =====================================================
// ENCERRAR
// =====================================================

async function encerrar() {
    console.log("Encerrando...");

    await encerrarPublicadorMQTT();

    await desconectarRedis();

    process.exit(0);
}

process.on("SIGINT", encerrar);

process.on("SIGTERM", encerrar);

// =====================================================
// START
// =====================================================

iniciar();
