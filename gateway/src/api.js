require("dotenv").config();

const express = require("express");
const cors = require("cors");

const {
    conectarRedis,
    desconectarRedis,
    consultarEstado,
    consultarHistorico,
    consultarUltimoContato,
    consultarPresenca,
} = require("./redis");

// =====================================================
// CONFIGURACAO
// =====================================================

const app = express();

const PORT = Number(process.env.API_PORT || 3000);

// Permite futuramente chamadas do painel web
app.use(cors());

// Permite trabalhar com JSON
app.use(express.json());

// =====================================================
// FUNCOES AUXILIARES
// =====================================================

function objetoVazio(objeto) {
    return !objeto || Object.keys(objeto).length === 0;
}

function tratarErroRedis(res, erro) {
    console.error("Erro ao acessar Redis:", erro.message);

    return res.status(503).json({
        sucesso: false,

        erro: "servico_indisponivel",

        mensagem: "Nao foi possivel acessar o banco Redis.",
    });
}

// =====================================================
// ROTA INICIAL
// =====================================================

app.get("/", (req, res) => {
    res.status(200).json({
        sucesso: true,

        projeto: "Despertador Inteligente",

        servico: "API IoT",

        versao: "1.0.0",
    });
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
    res.status(200).json({
        sucesso: true,

        status: "online",

        timestamp: new Date().toISOString(),
    });
});

// =====================================================
// ESTADO ATUAL
// GET /api/devices/:deviceId/state
// =====================================================

app.get(
    "/api/devices/:deviceId/state",

    async (req, res) => {
        const { deviceId } = req.params;

        try {
            const estado = await consultarEstado(deviceId);

            // Nenhum estado confirmado
            if (objetoVazio(estado)) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "estado_nao_encontrado",

                    mensagem: `Nenhum estado confirmado encontrado para ${deviceId}.`,
                });
            }

            return res.status(200).json({
                sucesso: true,

                deviceId,

                estado,
            });
        } catch (erro) {
            return tratarErroRedis(res, erro);
        }
    }
);

// =====================================================
// HISTORICO
//
// GET /api/devices/:deviceId/history
// GET /api/devices/:deviceId/history?limit=20
// =====================================================

app.get(
    "/api/devices/:deviceId/history",

    async (req, res) => {
        const { deviceId } = req.params;

        let limite = Number(req.query.limit || 10);

        // ---------------------------------------------
        // VALIDAR LIMIT
        // ---------------------------------------------

        if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
            return res.status(400).json({
                sucesso: false,

                erro: "parametro_invalido",

                mensagem: "O parametro limit deve ser um numero inteiro entre 1 e 100.",
            });
        }

        try {
            const historico = await consultarHistorico(deviceId, limite);

            if (historico.length === 0) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "historico_nao_encontrado",

                    mensagem: `Nenhuma telemetria encontrada para ${deviceId}.`,
                });
            }

            return res.status(200).json({
                sucesso: true,

                deviceId,

                quantidade: historico.length,

                historico,
            });
        } catch (erro) {
            return tratarErroRedis(res, erro);
        }
    }
);

// =====================================================
// PRESENCA E ULTIMO CONTATO
//
// GET /api/devices/:deviceId/presence
// =====================================================

app.get(
    "/api/devices/:deviceId/presence",

    async (req, res) => {
        const { deviceId } = req.params;

        try {
            const ultimoContato = await consultarUltimoContato(deviceId);

            /*
                Se nunca houve contato,
                provavelmente o dispositivo
                nao existe no Redis.
            */

            if (!ultimoContato) {
                return res.status(404).json({
                    sucesso: false,

                    erro: "dispositivo_nao_encontrado",

                    mensagem: `Nenhum registro encontrado para ${deviceId}.`,
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
            return tratarErroRedis(res, erro);
        }
    }
);

// =====================================================
// ROTA NAO ENCONTRADA
// =====================================================

app.use((req, res) => {
    res.status(404).json({
        sucesso: false,

        erro: "rota_nao_encontrada",

        mensagem: "O endpoint solicitado nao existe.",
    });
});

// =====================================================
// INICIAR API
// =====================================================

async function iniciarAPI() {
    console.clear();

    console.log("Despertador Inteligente - API");

    console.log();

    try {
        await conectarRedis();

        console.log("[OK] Redis conectado");

        app.listen(PORT, () => {
            console.log(`[OK] API executando na porta ${PORT}`);

            console.log();

            console.log("Endpoints:");

            console.log(`GET /api/devices/:deviceId/state`);

            console.log(`GET /api/devices/:deviceId/history`);

            console.log(`GET /api/devices/:deviceId/presence`);

            console.log();
        });
    } catch (erro) {
        console.error("[ERRO] Nao foi possivel iniciar a API");

        console.error(erro.message);

        process.exit(1);
    }
}

// =====================================================
// ENCERRAMENTO
// =====================================================

async function encerrar() {
    console.log();

    console.log("Encerrando API...");

    try {
        await desconectarRedis();
    } catch (erro) {
        console.error(erro.message);
    }

    process.exit(0);
}

process.on("SIGINT", encerrar);

process.on("SIGTERM", encerrar);

// =====================================================
// START
// =====================================================

iniciarAPI();
