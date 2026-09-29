require("dotenv").config();

const mqtt = require("mqtt");
const readline = require("readline");
const { randomUUID } = require("crypto");

const { validarTelemetria, validarEstado } = require("./validator");

const { registrarValida, registrarInvalida } = require("./logger");

const {
    conectarRedis,
    desconectarRedis,
    persistirTelemetria,
    registrarComandoEnviado,
    registrarFalhaComando,
    persistirConfirmacaoEstado,
} = require("./redis");

// =====================================================
// CONFIGURACAO
// =====================================================

const MQTT_HOST = process.env.MQTT_HOST;

const MQTT_PORT = Number(process.env.MQTT_PORT || 8883);

const MQTT_USERNAME = process.env.MQTT_USERNAME;

const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "gateway-despertador-gab";

const DEVICE_PADRAO = process.env.DEVICE_ID || "esp32-01";

// =====================================================
// TOPICOS
// =====================================================

const TOPICO_TELEMETRIA = "despertador/gab/+/telemetria";

const TOPICO_ESTADO = "despertador/gab/+/estado";

// =====================================================
// CLIENTE MQTT
// =====================================================

let clienteMQTT = null;

let encerrando = false;

// =====================================================
// TERMINAL
// =====================================================

const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
});

// =====================================================
// INTERPRETAR TOPICO
// =====================================================

function interpretarTopico(topico) {
    const partes = topico.split("/");

    if (partes.length !== 4 || partes[0] !== "despertador" || partes[1] !== "gab") {
        return null;
    }

    return {
        dispositivo: partes[2],

        tipo: partes[3],
    };
}

// =====================================================
// CRIAR TOPICO DE COMANDO
// =====================================================

function criarTopicoComando(deviceId) {
    return `despertador/gab/` + `${deviceId}/comando`;
}

// =====================================================
// MENU
// =====================================================

function mostrarMenu() {
    console.log();
    console.log("Comandos: ligar | desligar | automatico | menu | sair");
    console.log();

    terminal.prompt();
}

// =====================================================
// PUBLICAR COMANDO
// =====================================================

async function publicarComando(deviceId, comando) {
    const comandosAceitos = ["ligar_alarme", "desligar_alarme", "automatico"];

    if (!comandosAceitos.includes(comando)) {
        console.log("[ERRO] Comando nao suportado");

        terminal.prompt();

        return;
    }

    if (!clienteMQTT || !clienteMQTT.connected) {
        console.log("[ERRO] MQTT desconectado");

        terminal.prompt();

        return;
    }

    const requestId = `cmd-${randomUUID()}`;

    const topico = criarTopicoComando(deviceId);

    const mensagem = {
        requestId,
        comando,
    };

    const payload = JSON.stringify(mensagem);

    // Primeiro registra no Redis
    // como "enviado".
    await registrarComandoEnviado(deviceId, requestId, comando, topico);

    try {
        await new Promise((resolve, reject) => {
            clienteMQTT.publish(
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

        console.log();

        console.log(`[ENVIO] ${deviceId}`);

        console.log(`  comando: ${comando}`);

        console.log("  status: enviado");

        console.log(`  requestId: ${requestId}`);

        console.log("  aguardando confirmacao...");

        console.log();
    } catch (erro) {
        await registrarFalhaComando(deviceId, requestId, erro.message);

        console.log();

        console.log(`[ERRO] Falha ao publicar ${comando}`);

        console.log(`  ${erro.message}`);

        console.log();
    }

    terminal.prompt();
}

// =====================================================
// PROCESSAR TELEMETRIA
// =====================================================

async function processarTelemetria(dispositivo, topico, dados) {
    const resultado = validarTelemetria(dados);

    if (!resultado.valido) {
        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,
            topico,
            tipo: "telemetria",
            dados,

            erros: resultado.erros,
        });

        console.log(`[ERRO] Telemetria invalida de ${dispositivo}`);

        return;
    }

    registrarValida({
        timestamp: new Date().toISOString(),

        dispositivo,
        topico,
        tipo: "telemetria",

        dados,
    });

    await persistirTelemetria(dispositivo, dados);

    // Mantemos somente uma mensagem curta.
    console.log(`[TELEMETRIA] ${dispositivo} -> Redis atualizado`);
}

// =====================================================
// PROCESSAR CONFIRMACAO
// =====================================================

async function processarEstado(dispositivo, topico, dados) {
    const resultado = validarEstado(dados);

    if (!resultado.valido) {
        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,
            topico,
            tipo: "estado",

            dados,

            erros: resultado.erros,
        });

        /*
            Não poluímos o terminal
            mostrando todos os campos.

            Apenas avisamos resumidamente.
        */

        console.log(`[IGNORADO] Estado antigo/invalido de ${dispositivo}`);

        return;
    }

    registrarValida({
        timestamp: new Date().toISOString(),

        dispositivo,
        topico,
        tipo: "estado",

        dados,
    });

    await persistirConfirmacaoEstado(dispositivo, dados);

    // Eventos internos do modo automatico
    // não são comandos enviados pelo Gateway.
    if (
        dados.requestId === "evento" ||
        dados.requestId === "startup" ||
        dados.requestId === "sem-id"
    ) {
        return;
    }

    console.log();

    console.log(`[CONFIRMACAO] ${dispositivo}`);

    console.log(`  comando: ${dados.comando}`);

    console.log(`  executado: ${dados.executado ? "sim" : "nao"}`);

    console.log(`  alarme: ${dados.alarmeAtivo ? "ligado" : "desligado"}`);

    console.log("  Redis: atualizado");

    console.log(`  status: ${dados.executado ? "confirmado" : "rejeitado"}`);

    console.log(`  requestId: ${dados.requestId}`);

    console.log();

    terminal.prompt();
}

// =====================================================
// PROCESSAR MENSAGEM MQTT
// =====================================================

async function processarMensagem(topico, payload) {
    const informacoes = interpretarTopico(topico);

    if (!informacoes) {
        console.log(`[ERRO] Topico invalido: ${topico}`);

        return;
    }

    const { dispositivo, tipo } = informacoes;

    let dados;

    try {
        dados = JSON.parse(payload.toString());
    } catch (erro) {
        registrarInvalida({
            timestamp: new Date().toISOString(),

            dispositivo,
            topico,
            tipo,

            mensagem: payload.toString(),

            erros: ["JSON invalido"],
        });

        console.log(`[ERRO] JSON invalido de ${dispositivo}`);

        return;
    }

    // =================================================
    // TELEMETRIA
    // =================================================

    if (tipo === "telemetria") {
        await processarTelemetria(dispositivo, topico, dados);

        return;
    }

    // =================================================
    // CONFIRMACAO
    // =================================================

    if (tipo === "estado") {
        await processarEstado(dispositivo, topico, dados);
    }
}

// =====================================================
// CONECTAR MQTT
// =====================================================

function conectarMQTT() {
    clienteMQTT = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
        username: MQTT_USERNAME,

        password: MQTT_PASSWORD,

        clientId: MQTT_CLIENT_ID,

        rejectUnauthorized: true,

        reconnectPeriod: 5000,

        connectTimeout: 10000,

        clean: true,
    });

    // =================================================
    // CONECTADO
    // =================================================

    clienteMQTT.on("connect", () => {
        console.log("[OK] MQTT conectado");

        clienteMQTT.subscribe(
            [TOPICO_TELEMETRIA, TOPICO_ESTADO],
            {
                qos: 1,
            },
            (erro) => {
                if (erro) {
                    console.log(`[ERRO] Assinatura MQTT: ${erro.message}`);

                    return;
                }

                console.log(`[OK] Aguardando ${DEVICE_PADRAO}`);

                mostrarMenu();
            }
        );
    });

    // =================================================
    // MENSAGEM
    // =================================================

    clienteMQTT.on("message", async (topico, payload) => {
        try {
            await processarMensagem(topico, payload);
        } catch (erro) {
            console.log(`[ERRO] Processamento: ${erro.message}`);
        }
    });

    // =================================================
    // RECONEXAO
    // =================================================

    clienteMQTT.on("reconnect", () => {
        console.log("[MQTT] Reconectando...");
    });

    // =================================================
    // OFFLINE
    // =================================================

    clienteMQTT.on("offline", () => {
        console.log("[MQTT] Offline");
    });

    // =================================================
    // ERRO
    // =================================================

    clienteMQTT.on("error", (erro) => {
        console.log(`[ERRO] MQTT: ${erro.message}`);
    });
}

// =====================================================
// TERMINAL
// =====================================================

terminal.on("line", async (entrada) => {
    const comando = entrada.trim().toLowerCase();

    if (comando === "") {
        terminal.prompt();

        return;
    }

    if (comando === "ligar") {
        await publicarComando(DEVICE_PADRAO, "ligar_alarme");

        return;
    }

    if (comando === "desligar") {
        await publicarComando(DEVICE_PADRAO, "desligar_alarme");

        return;
    }

    if (comando === "automatico") {
        await publicarComando(DEVICE_PADRAO, "automatico");

        return;
    }

    if (comando === "menu") {
        mostrarMenu();

        return;
    }

    if (comando === "sair") {
        await encerrarGateway();

        return;
    }

    console.log("[ERRO] Comando desconhecido");

    mostrarMenu();
});

// =====================================================
// INICIAR
// =====================================================

async function iniciarGateway() {
    console.clear();

    console.log("Despertador Inteligente - Gateway");

    console.log();

    try {
        await conectarRedis();

        console.log("[OK] Redis conectado");

        conectarMQTT();
    } catch (erro) {
        console.log(`[ERRO] Redis: ${erro.message}`);

        process.exit(1);
    }
}

// =====================================================
// ENCERRAR
// =====================================================

async function encerrarGateway() {
    if (encerrando) {
        return;
    }

    encerrando = true;

    console.log("Encerrando...");

    terminal.close();

    if (clienteMQTT) {
        await new Promise((resolve) => {
            clienteMQTT.end(false, {}, resolve);
        });
    }

    await desconectarRedis();

    process.exit(0);
}

process.on("SIGINT", encerrarGateway);

// =====================================================
// START
// =====================================================

iniciarGateway();
