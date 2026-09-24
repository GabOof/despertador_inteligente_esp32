require("dotenv").config();

const mqtt = require("mqtt");

const { validarTelemetria, validarEstado } = require("./validator");

const { registrarValida, registrarInvalida } = require("./logger");

const { conectarRedis, persistirMensagem } = require("./redis");

// =====================================================
// CONFIGURACAO MQTT
// =====================================================

const host = process.env.MQTT_HOST;

const porta = process.env.MQTT_PORT || 8883;

const usuario = process.env.MQTT_USERNAME;

const senha = process.env.MQTT_PASSWORD;

const clientId = process.env.MQTT_CLIENT_ID || "gateway-despertador-gab";

// =====================================================
// TOPICOS MQTT
// =====================================================

const topicoTelemetria = "despertador/gab/+/telemetria";

const topicoEstado = "despertador/gab/+/estado";

// =====================================================
// CLIENTE MQTT
// =====================================================

let clienteMQTT = null;

// =====================================================
// IDENTIFICAR DISPOSITIVO PELO TOPICO
// =====================================================

function interpretarTopico(topico) {
    const partes = topico.split("/");

    if (partes.length !== 4) {
        return null;
    }

    if (partes[0] !== "despertador" || partes[1] !== "gab") {
        return null;
    }

    return {
        dispositivo: partes[2],
        tipo: partes[3],
    };
}

// =====================================================
// PROCESSAR MENSAGEM MQTT
// =====================================================

async function processarMensagem(topico, payload) {
    const mensagem = payload.toString();

    console.log();
    console.log("========================================");

    console.log("NOVA MENSAGEM MQTT");

    console.log("========================================");

    console.log("Topico:", topico);

    console.log("Payload:", mensagem);

    // =================================================
    // IDENTIFICAR DISPOSITIVO
    // =================================================

    const informacoesTopico = interpretarTopico(topico);

    if (!informacoesTopico) {
        console.log();
        console.error("❌ TOPICO INVALIDO");

        registrarInvalida({
            timestamp: new Date().toISOString(),

            topico,

            mensagem,

            erros: ["Estrutura de topico invalida"],
        });

        return;
    }

    const { dispositivo, tipo } = informacoesTopico;

    console.log("Dispositivo:", dispositivo);

    console.log("Tipo:", tipo);

    // =================================================
    // INTERPRETAR JSON
    // =================================================

    let dados;

    try {
        dados = JSON.parse(mensagem);
    } catch (erro) {
        console.log();
        console.error("❌ JSON INVALIDO");

        console.error(erro.message);

        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,

            topico,

            tipo,

            mensagem,

            erros: ["JSON invalido"],
        });

        return;
    }

    // =================================================
    // VALIDAR MENSAGEM
    // =================================================

    let resultado;

    if (tipo === "telemetria") {
        resultado = validarTelemetria(dados);
    } else if (tipo === "estado") {
        resultado = validarEstado(dados);
    } else {
        resultado = {
            valido: false,

            erros: ["Tipo de mensagem desconhecido"],
        };
    }

    // =================================================
    // MENSAGEM INVALIDA
    // =================================================

    if (!resultado.valido) {
        console.log();

        console.error("❌ MENSAGEM INVALIDA");

        resultado.erros.forEach((erro) => {
            console.error(`- ${erro}`);
        });

        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,

            topico,

            tipo,

            dados,

            erros: resultado.erros,
        });

        return;
    }

    // =================================================
    // MENSAGEM VALIDA
    // =================================================

    console.log();

    console.log("✅ MENSAGEM VALIDA");

    console.log("Dados interpretados:");

    console.log(dados);

    // =================================================
    // REGISTRAR LOG
    // =================================================

    registrarValida({
        timestamp: new Date().toISOString(),

        dispositivo,

        topico,

        tipo,

        dados,
    });

    // =================================================
    // PERSISTIR NO REDIS
    // =================================================

    try {
        await persistirMensagem(dispositivo, tipo, dados);

        console.log();

        console.log("✅ Mensagem persistida no Redis");
    } catch (erro) {
        console.log();

        console.error("❌ Erro ao persistir no Redis:");

        console.error(erro.message);
    }
}

// =====================================================
// CONECTAR AO MQTT
// =====================================================

function conectarMQTT() {
    console.log();

    console.log("Iniciando conexao MQTT...");

    console.log(`Broker: ${host}:${porta}`);

    clienteMQTT = mqtt.connect(`mqtts://${host}:${porta}`, {
        username: usuario,

        password: senha,

        clientId: clientId,

        // Valida o certificado TLS
        rejectUnauthorized: true,

        // Tenta reconectar a cada 5 segundos
        reconnectPeriod: 5000,

        // Timeout
        connectTimeout: 10000,

        clean: true,
    });

    // =================================================
    // MQTT CONECTADO
    // =================================================

    clienteMQTT.on("connect", () => {
        console.log();

        console.log("========================================");

        console.log("GATEWAY MQTT CONECTADO!");

        console.log("========================================");

        // -----------------------------------------
        // ASSINAR TOPICOS
        // -----------------------------------------

        clienteMQTT.subscribe(
            [topicoTelemetria, topicoEstado],
            {
                qos: 0,
            },
            (erro) => {
                if (erro) {
                    console.error("Erro ao assinar topicos:");

                    console.error(erro.message);

                    return;
                }

                console.log();

                console.log("Topicos assinados:");

                console.log(`- ${topicoTelemetria}`);

                console.log(`- ${topicoEstado}`);

                console.log();

                console.log("Aguardando mensagens...");
            }
        );
    });

    // =================================================
    // MENSAGEM RECEBIDA
    // =================================================

    clienteMQTT.on("message", async (topico, payload) => {
        try {
            await processarMensagem(topico, payload);
        } catch (erro) {
            console.error();

            console.error("Erro inesperado ao processar mensagem:");

            console.error(erro.message);
        }
    });

    // =================================================
    // RECONEXAO MQTT
    // =================================================

    clienteMQTT.on("reconnect", () => {
        console.log();

        console.log("Tentando reconectar ao broker MQTT...");
    });

    // =================================================
    // MQTT OFFLINE
    // =================================================

    clienteMQTT.on("offline", () => {
        console.log();

        console.log("Gateway MQTT offline.");
    });

    // =================================================
    // CONEXAO MQTT FECHADA
    // =================================================

    clienteMQTT.on("close", () => {
        console.log("Conexao MQTT encerrada.");
    });

    // =================================================
    // ERRO MQTT
    // =================================================

    clienteMQTT.on("error", (erro) => {
        console.error();

        console.error("Erro MQTT:");

        console.error(erro.message);
    });
}

// =====================================================
// INICIAR GATEWAY
// =====================================================

async function iniciarGateway() {
    console.log();

    console.log("========================================");

    console.log("DESPERTADOR INTELIGENTE - GATEWAY");

    console.log("========================================");

    try {
        // -----------------------------------------
        // REDIS
        // -----------------------------------------

        console.log();

        console.log("Conectando ao Redis...");

        await conectarRedis();

        console.log("✅ Redis pronto para uso");

        // -----------------------------------------
        // MQTT
        // -----------------------------------------

        conectarMQTT();
    } catch (erro) {
        console.error();

        console.error("❌ Falha ao iniciar Gateway");

        console.error(erro.message);

        process.exit(1);
    }
}

// =====================================================
// ENCERRAMENTO
// =====================================================

process.on("SIGINT", () => {
    console.log();

    console.log("Encerrando Gateway...");

    if (clienteMQTT) {
        clienteMQTT.end();
    }

    process.exit(0);
});

// =====================================================
// START
// =====================================================

iniciarGateway();
