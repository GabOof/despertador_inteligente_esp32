const fs = require("fs");
const path = require("path");

const pastaLogs = path.join(__dirname, "../logs");

if (!fs.existsSync(pastaLogs)) {
    fs.mkdirSync(pastaLogs, {
        recursive: true,
    });
}

const arquivoValidas = path.join(pastaLogs, "validas.log");

const arquivoInvalidas = path.join(pastaLogs, "invalidas.log");

function salvarLog(arquivo, dados) {
    const linha = JSON.stringify(dados) + "\n";

    fs.appendFileSync(arquivo, linha, "utf8");
}

function registrarValida(dados) {
    salvarLog(arquivoValidas, dados);
}

function registrarInvalida(dados) {
    salvarLog(arquivoInvalidas, dados);
}

module.exports = {
    registrarValida,
    registrarInvalida,
};
