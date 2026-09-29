function validarObjeto(dados) {
    return typeof dados === "object" && dados !== null && !Array.isArray(dados);
}

function validarTelemetria(dados) {
    const erros = [];

    if (!validarObjeto(dados)) {
        return {
            valido: false,
            erros: ["A mensagem precisa ser um objeto JSON"],
        };
    }

    if (dados.deviceId !== undefined && typeof dados.deviceId !== "string") {
        erros.push("deviceId deve ser string");
    }

    if (typeof dados.movimento !== "boolean") {
        erros.push("movimento deve ser boolean");
    }

    if (typeof dados.ledVerde !== "boolean") {
        erros.push("ledVerde deve ser boolean");
    }

    if (typeof dados.ledVermelho !== "boolean") {
        erros.push("ledVermelho deve ser boolean");
    }

    if (typeof dados.alarmeAtivo !== "boolean") {
        erros.push("alarmeAtivo deve ser boolean");
    }

    if (typeof dados.modoAutomatico !== "boolean") {
        erros.push("modoAutomatico deve ser boolean");
    }

    if (typeof dados.pausaMovimento !== "boolean") {
        erros.push("pausaMovimento deve ser boolean");
    }

    if (typeof dados.rssi !== "number") {
        erros.push("rssi deve ser number");
    }

    if (dados.uptimeMs !== undefined && typeof dados.uptimeMs !== "number") {
        erros.push("uptimeMs deve ser number");
    }

    return {
        valido: erros.length === 0,

        erros,
    };
}

function validarEstado(dados) {
    const erros = [];

    if (!validarObjeto(dados)) {
        return {
            valido: false,
            erros: ["A mensagem precisa ser um objeto JSON"],
        };
    }

    if (typeof dados.requestId !== "string" || dados.requestId.trim() === "") {
        erros.push("requestId deve ser string nao vazia");
    }

    if (typeof dados.comando !== "string" || dados.comando.trim() === "") {
        erros.push("comando deve ser string nao vazia");
    }

    if (typeof dados.executado !== "boolean") {
        erros.push("executado deve ser boolean");
    }

    if (typeof dados.alarmeAtivo !== "boolean") {
        erros.push("alarmeAtivo deve ser boolean");
    }

    if (typeof dados.modoAutomatico !== "boolean") {
        erros.push("modoAutomatico deve ser boolean");
    }

    if (typeof dados.pausaMovimento !== "boolean") {
        erros.push("pausaMovimento deve ser boolean");
    }

    if (dados.motivo !== undefined && typeof dados.motivo !== "string") {
        erros.push("motivo deve ser string");
    }

    return {
        valido: erros.length === 0,

        erros,
    };
}

module.exports = {
    validarTelemetria,
    validarEstado,
};
