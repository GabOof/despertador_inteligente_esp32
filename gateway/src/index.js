require("dotenv").config();

const mqtt = require("mqtt");

const { validarTelemetria, validarEstado } = require("./validator");

const { registrarValida, registrarInvalida } = require("./logger");

// =====================================================
// CONFIGURAÇÃO MQTT
// =====================================================

const host = process.env.MQTT_HOST;
const porta = process.env.MQTT_PORT || 8883;

const usuario = process.env.MQTT_USERNAME;
const senha = process.env.MQTT_PASSWORD;

const clientId = process.env.MQTT_CLIENT_ID || "gateway-despertador";

// =====================================================
// TÓPICOS
// =====================================================

// O + representa qualquer dispositivo.
//
// Exemplo:
// despertador/gab/esp32-01/telemetria
// despertador/gab/esp32-02/telemetria

const topicoTelemetria = "despertador/gab/+/telemetria";

const topicoEstado = "despertador/gab/+/estado";

// =====================================================
// CONEXÃO
// =====================================================

console.log("Iniciando Gateway MQTT...");

console.log(`Broker: ${host}:${porta}`);

const cliente = mqtt.connect(`mqtts://${host}:${porta}`, {
    username: usuario,
    password: senha,
    clientId,

    // TLS
    rejectUnauthorized: true,

    // Reconexão automática
    reconnectPeriod: 5000,

    // Timeout da conexão
    connectTimeout: 10000,
});

// =====================================================
// CONECTADO
// =====================================================

cliente.on("connect", () => {
    console.log();
    console.log("==============================");
    console.log("GATEWAY MQTT CONECTADO!");
    console.log("==============================");

    cliente.subscribe([topicoTelemetria, topicoEstado], (erro) => {
        if (erro) {
            console.error("Erro ao assinar tópicos:", erro.message);

            return;
        }

        console.log();
        console.log("Tópicos assinados:");

        console.log(`- ${topicoTelemetria}`);

        console.log(`- ${topicoEstado}`);
    });
});

// =====================================================
// MENSAGEM RECEBIDA
// =====================================================

cliente.on("message", (topico, payload) => {
    const mensagem = payload.toString();

    console.log();
    console.log("======================================");

    console.log("NOVA MENSAGEM MQTT");

    console.log("======================================");

    console.log("Tópico:", topico);

    console.log("Payload:", mensagem);

    // =============================================
    // IDENTIFICAR DISPOSITIVO
    // =============================================

    const partesTopico = topico.split("/");

    /*
            Exemplo:

            despertador/gab/esp32-01/telemetria

            [0] despertador
            [1] gab
            [2] esp32-01
            [3] telemetria
        */

    const dispositivo = partesTopico[2];

    const tipoMensagem = partesTopico[3];

    console.log("Dispositivo:", dispositivo);

    console.log("Tipo:", tipoMensagem);

    // =============================================
    // INTERPRETAR JSON
    // =============================================

    let dados;

    try {
        dados = JSON.parse(mensagem);
    } catch (erro) {
        console.error("❌ JSON INVÁLIDO");

        console.error(erro.message);

        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,
            topico,
            mensagem,

            erros: ["JSON inválido"],
        });

        return;
    }

    // =============================================
    // VALIDAR
    // =============================================

    let resultado;

    if (tipoMensagem === "telemetria") {
        resultado = validarTelemetria(dados);
    } else if (tipoMensagem === "estado") {
        resultado = validarEstado(dados);
    } else {
        resultado = {
            valido: false,
            erros: ["Tipo de mensagem desconhecido"],
        };
    }

    // =============================================
    // MENSAGEM INVÁLIDA
    // =============================================

    if (!resultado.valido) {
        console.log();
        console.error("❌ MENSAGEM INVÁLIDA");

        resultado.erros.forEach((erro) => {
            console.error(`- ${erro}`);
        });

        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,
            topico,
            tipo: tipoMensagem,

            dados,

            erros: resultado.erros,
        });

        return;
    }

    // =============================================
    // MENSAGEM VÁLIDA
    // =============================================

    console.log();
    console.log("✅ MENSAGEM VÁLIDA");

    console.log("Dados interpretados:");

    console.log(dados);

    registrarValida({
        timestamp: new Date().toISOString(),

        dispositivo,
        topico,
        tipo: tipoMensagem,

        dados,
    });
});

// =====================================================
// RECONEXÃO
// =====================================================

cliente.on("reconnect", () => {
    console.log("Tentando reconectar ao broker...");
});

// =====================================================
// DESCONECTADO
// =====================================================

cliente.on("offline", () => {
    console.log("Gateway MQTT offline.");
});

// =====================================================
// ERRO
// =====================================================

cliente.on("error", (erro) => {
    console.error("Erro MQTT:", erro.message);
});
