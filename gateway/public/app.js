const DEVICE_ID = "esp32-01";

// =====================================================
// ELEMENTOS
// =====================================================

const presenceElement = document.getElementById("presence");

const lastSeenElement = document.getElementById("lastSeen");

const movementElement = document.getElementById("movement");

const alarmElement = document.getElementById("alarm");

const alarmModeElement = document.getElementById("alarmMode");

const rssiElement = document.getElementById("rssi");

const connectionStatusElement = document.getElementById("connectionStatus");

const historyElement = document.getElementById("history");

const commandStatusElement = document.getElementById("commandStatus");

const btnTurnOn = document.getElementById("btnTurnOn");

const btnTurnOff = document.getElementById("btnTurnOff");

const btnAutomatic = document.getElementById("btnAutomatic");

const btnRefresh = document.getElementById("btnRefresh");

// =====================================================
// CONVERSOES
// =====================================================

function paraBooleano(valor) {
    return valor === true || valor === "true";
}

function formatarData(data) {
    if (!data) {
        return "--";
    }

    return new Date(data).toLocaleString("pt-BR");
}

// =====================================================
// REQUISICAO
// =====================================================

async function requisicao(url, options = {}) {
    const resposta = await fetch(url, options);

    const dados = await resposta.json();

    if (!resposta.ok) {
        throw new Error(dados.mensagem || "Erro na API");
    }

    return dados;
}

// =====================================================
// CARREGAR ESTADO
// =====================================================

async function carregarEstado() {
    try {
        const resultado = await requisicao(`/api/devices/${DEVICE_ID}/state`);

        const telemetria = resultado.telemetriaAtual || {};

        const estado = resultado.estadoConfirmado || {};

        // -----------------------------------------
        // MOVIMENTO
        // -----------------------------------------

        const movimento = paraBooleano(telemetria.movimento);

        movementElement.textContent = movimento ? "Detectado" : "Sem movimento";

        movementElement.className = movimento ? "online" : "";

        // -----------------------------------------
        // RSSI
        // -----------------------------------------

        if (telemetria.rssi !== undefined) {
            rssiElement.textContent = `${telemetria.rssi} dBm`;
        } else {
            rssiElement.textContent = "--";
        }

        // -----------------------------------------
        // ALARME
        // -----------------------------------------

        const alarme = paraBooleano(estado.alarmeAtivo ?? telemetria.alarmeAtivo);

        alarmElement.textContent = alarme ? "Ligado" : "Desligado";

        alarmElement.className = alarme ? "offline" : "online";

        // -----------------------------------------
        // MODO
        // -----------------------------------------

        const automatico = paraBooleano(estado.modoAutomatico ?? telemetria.modoAutomatico);

        const pausa = paraBooleano(estado.pausaMovimento ?? telemetria.pausaMovimento);

        if (automatico) {
            alarmModeElement.textContent = pausa ? "Modo automático - pausado" : "Modo automático";
        } else {
            alarmModeElement.textContent = "Modo manual";
        }

        connectionStatusElement.textContent = "API conectada";
    } catch (erro) {
        connectionStatusElement.textContent = "Erro na API";

        console.error(erro);
    }
}

// =====================================================
// PRESENCA
// =====================================================

async function carregarPresenca() {
    try {
        const dados = await requisicao(`/api/devices/${DEVICE_ID}/presence`);

        const online = dados.presenca === "online";

        presenceElement.textContent = online ? "Online" : "Offline";

        presenceElement.className = online ? "online" : "offline";

        lastSeenElement.textContent = `Último contato: ${formatarData(dados.ultimoContato)}`;
    } catch (erro) {
        presenceElement.textContent = "Indisponível";

        presenceElement.className = "offline";
    }
}

// =====================================================
// HISTORICO
// =====================================================

async function carregarHistorico() {
    try {
        const dados = await requisicao(`/api/devices/${DEVICE_ID}/history?limit=15`);

        historyElement.innerHTML = "";

        /*
            Mostra os mais recentes
            primeiro na interface.
        */

        const historico = [...dados.historico].reverse();

        historico.forEach((registro) => {
            const item = document.createElement("div");

            item.className = "history-item";

            item.innerHTML = `
                    <span>
                        ${formatarData(registro.recebidoEm)}
                    </span>

                    <strong>
                        Movimento:
                        ${registro.movimento ? "Sim" : "Não"}
                    </strong>

                    <strong>
                        Alarme:
                        ${registro.alarmeAtivo ? "Ligado" : "Desligado"}
                    </strong>

                    <strong>
                        RSSI:
                        ${registro.rssi ?? "--"} dBm
                    </strong>
                `;

            historyElement.appendChild(item);
        });
    } catch (erro) {
        historyElement.innerHTML = `<p class="empty">${erro.message}</p>`;
    }
}

// =====================================================
// CONTROLES
// =====================================================

function bloquearControles(bloquear) {
    btnTurnOn.disabled = bloquear;

    btnTurnOff.disabled = bloquear;

    btnAutomatic.disabled = bloquear;
}

// =====================================================
// ENVIAR COMANDO
// =====================================================

async function enviarComando(comando) {
    bloquearControles(true);

    commandStatusElement.className = "command-status";

    commandStatusElement.textContent = "Enviando comando...";

    try {
        const resposta = await requisicao(`/api/devices/${DEVICE_ID}/commands`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                comando,
            }),
        });

        commandStatusElement.textContent = "Comando enviado. Aguardando confirmação do ESP32...";

        await aguardarConfirmacao(resposta.requestId);
    } catch (erro) {
        commandStatusElement.className = "command-status error";

        commandStatusElement.textContent = erro.message;

        bloquearControles(false);
    }
}

// =====================================================
// AGUARDAR CONFIRMACAO
// =====================================================

async function aguardarConfirmacao(requestId) {
    const inicio = Date.now();

    const timeout = 12000;

    while (Date.now() - inicio < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 700));

        try {
            const resultado = await requisicao(`/api/devices/${DEVICE_ID}/commands/${requestId}`);

            const comando = resultado.comando;

            if (comando.status === "confirmado") {
                commandStatusElement.className = "command-status success";

                commandStatusElement.textContent = "Comando executado e confirmado pelo ESP32.";

                bloquearControles(false);

                await atualizarTudo();

                return;
            }

            if (comando.status === "rejeitado") {
                commandStatusElement.className = "command-status error";

                commandStatusElement.textContent = "O ESP32 rejeitou o comando.";

                bloquearControles(false);

                return;
            }

            if (comando.status === "falha_publicacao") {
                throw new Error("Falha ao publicar o comando MQTT.");
            }
        } catch (erro) {
            /*
                404 temporário pode ocorrer
                antes do registro ser atualizado.

                Continuamos tentando.
            */

            console.log(erro.message);
        }
    }

    commandStatusElement.className = "command-status error";

    commandStatusElement.textContent = "O ESP32 não confirmou o comando dentro do tempo esperado.";

    bloquearControles(false);
}

// =====================================================
// ATUALIZAR TUDO
// =====================================================

async function atualizarTudo() {
    await Promise.all([carregarEstado(), carregarPresenca(), carregarHistorico()]);
}

// =====================================================
// EVENTOS
// =====================================================

btnTurnOn.addEventListener("click", () => {
    enviarComando("ligar_alarme");
});

btnTurnOff.addEventListener("click", () => {
    enviarComando("desligar_alarme");
});

btnAutomatic.addEventListener("click", () => {
    enviarComando("automatico");
});

btnRefresh.addEventListener("click", atualizarTudo);

// =====================================================
// INICIALIZACAO
// =====================================================

atualizarTudo();

// Atualiza monitoramento
// automaticamente a cada 5 segundos.

setInterval(atualizarTudo, 5000);
