require("dotenv").config();

const {
    conectarRedis,
    consultarEstado,
    consultarHistorico,
    consultarUltimoContato,
    consultarPresenca,
} = require("../src/redis");

async function consultar() {
    try {
        await conectarRedis();

        const dispositivo = "esp32-01";

        console.log();
        console.log("==============================");

        console.log(`DISPOSITIVO: ${dispositivo}`);

        console.log("==============================");

        // -----------------------------------------
        // ESTADO
        // -----------------------------------------

        const estado = await consultarEstado(dispositivo);

        console.log();
        console.log("ESTADO ATUAL:");

        console.log(estado);

        // -----------------------------------------
        // ULTIMO CONTATO
        // -----------------------------------------

        const ultimoContato = await consultarUltimoContato(dispositivo);

        console.log();
        console.log("ULTIMO CONTATO:");

        console.log(ultimoContato);

        // -----------------------------------------
        // PRESENCA
        // -----------------------------------------

        const presenca = await consultarPresenca(dispositivo);

        console.log();
        console.log("PRESENCA:");

        console.log(presenca);

        // -----------------------------------------
        // HISTORICO
        // -----------------------------------------

        const historico = await consultarHistorico(dispositivo);

        console.log();
        console.log(`HISTORICO (${historico.length} registros):`);

        console.log(historico);

        process.exit(0);
    } catch (erro) {
        console.error("Erro:", erro.message);

        process.exit(1);
    }
}

consultar();
