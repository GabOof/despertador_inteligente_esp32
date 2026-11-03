const mqtt = require("mqtt");

const { randomUUID } = require("crypto");

const { registrarComandoEnviado, registrarFalhaComando } = require("./redis");

// =====================================================
// CONFIGURACAO
// =====================================================

const MQTT_HOST = process.env.MQTT_HOST;

const MQTT_PORT = Number(process.env.MQTT_PORT || 8883);

const MQTT_USERNAME = process.env.MQTT_USERNAME;

const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

// IMPORTANTE:
// Deve ser diferente do ClientId do Gateway.

const MQTT_API_CLIENT_ID = process.env.MQTT_API_CLIENT_ID || "api-despertador-gab";

// =====================================================
// CLIENTE MQTT
// =====================================================

let cliente = null;

let conectado = false;

// =====================================================
// INICIAR CLIENTE MQTT
// =====================================================

function iniciarPublicadorMQTT() {
    cliente = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
        username: MQTT_USERNAME,

        password: MQTT_PASSWORD,

        clientId: MQTT_API_CLIENT_ID,

        rejectUnauthorized: true,

        reconnectPeriod: 5000,

        connectTimeout: 10000,

        clean: true,
    });

    cliente.on("connect", () => {
        conectado = true;

        console.log("[OK] MQTT da API conectado");
    });

    cliente.on("offline", () => {
        conectado = false;

        console.log("[MQTT API] Offline");
    });

    cliente.on("close", () => {
        conectado = false;
    });

    cliente.on("reconnect", () => {
        console.log("[MQTT API] Reconectando...");
    });

    cliente.on("error", (erro) => {
        conectado = false;

        console.log(`[ERRO MQTT API] ${erro.message}`);
    });
}

// =====================================================
// VERIFICAR CONEXAO
// =====================================================

function mqttDisponivel() {
    return cliente && conectado && cliente.connected;
}

// =====================================================
// TOPICO
// =====================================================

function criarTopicoComando(deviceId) {
    return `despertador/gab/` + `${deviceId}/comando`;
}

// =====================================================
// PUBLICAR COMANDO
// =====================================================

async function publicarComando(deviceId, comando) {
    if (!mqttDisponivel()) {
        throw new Error("MQTT indisponivel");
    }

    const comandosPermitidos = ["ligar_alarme", "desligar_alarme", "automatico"];

    if (!comandosPermitidos.includes(comando)) {
        throw new Error("Comando nao suportado");
    }

    const requestId = `cmd-${randomUUID()}`;

    const topico = criarTopicoComando(deviceId);

    const mensagem = {
        requestId,
        comando,
        enviadoPor: "api-web",
    };

    const payload = JSON.stringify(mensagem);

    // Antes de publicar:
    // registra como ENVIADO.

    await registrarComandoEnviado(deviceId, requestId, comando, topico);

    try {
        await new Promise((resolve, reject) => {
            cliente.publish(
                topico,
                payload,
                {
                    qos: 1,
                    retain: false,
                },
                (erro) => {
                    if (erro) {
                        reject(erro);

                        return;
                    }

                    resolve();
                }
            );
        });

        console.log(`[COMANDO] ${deviceId} -> ${comando}`);

        return {
            requestId,
            deviceId,
            comando,
            status: "enviado",
        };
    } catch (erro) {
        await registrarFalhaComando(deviceId, requestId, erro.message);

        throw erro;
    }
}

// =====================================================
// ENCERRAR
// =====================================================

async function encerrarPublicadorMQTT() {
    if (!cliente) {
        return;
    }

    await new Promise((resolve) => {
        cliente.end(false, {}, resolve);
    });
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    iniciarPublicadorMQTT,
    publicarComando,
    mqttDisponivel,
    encerrarPublicadorMQTT,
};
