require("dotenv").config();

const {
    conectarRedis,

    desconectarRedis,

    consultarEstado,

    consultarTelemetriaAtual,

    consultarHistorico,

    consultarUltimoContato,

    consultarPresenca,

    consultarUltimoComando,

    consultarComandos,
} = require("../src/redis");

async function consultar() {
    const deviceId = process.argv[2] || process.env.DEVICE_ID || "esp32-01";

    try {
        await conectarRedis();

        console.log();

        console.log("========================================");

        console.log(`DISPOSITIVO: ${deviceId}`);

        console.log("========================================");

        // =================================================
        // ESTADO CONFIRMADO
        // =================================================

        const estado = await consultarEstado(deviceId);

        console.log();

        console.log("ESTADO CONFIRMADO PELO ESP32:");

        console.log(estado);

        // =================================================
        // TELEMETRIA
        // =================================================

        const telemetria = await consultarTelemetriaAtual(deviceId);

        console.log();

        console.log("ULTIMA TELEMETRIA:");

        console.log(telemetria);

        // =================================================
        // ULTIMO CONTATO
        // =================================================

        const ultimoContato = await consultarUltimoContato(deviceId);

        console.log();

        console.log("ULTIMO CONTATO:");

        console.log(ultimoContato);

        // =================================================
        // PRESENCA
        // =================================================

        const presenca = await consultarPresenca(deviceId);

        console.log();

        console.log("PRESENCA:");

        console.log(presenca);

        // =================================================
        // ULTIMO COMANDO
        // =================================================

        const ultimoComando = await consultarUltimoComando(deviceId);

        console.log();

        console.log("ULTIMO COMANDO:");

        console.log(ultimoComando);

        // =================================================
        // COMANDOS
        // =================================================

        const comandos = await consultarComandos(deviceId, 10);

        console.log();

        console.log("ULTIMOS COMANDOS:");

        console.log(comandos);

        // =================================================
        // HISTORICO
        // =================================================

        const historico = await consultarHistorico(deviceId, 10);

        console.log();

        console.log("ULTIMAS TELEMETRIAS:");

        console.log(historico);
    } catch (erro) {
        console.error("Erro ao consultar Redis:");

        console.error(erro.message);
    } finally {
        await desconectarRedis();
    }
}

consultar();
