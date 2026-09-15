function validarTelemetria(dados) {
    const erros = [];

    if (typeof dados !== "object" || dados === null) {
        return {
            valido: false,
            erros: ["A mensagem precisa ser um objeto JSON"],
        };
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

    if (typeof dados.rssi !== "number") {
        erros.push("rssi deve ser number");
    }

    // Campos opcionais
    if (dados.modoAutomatico !== undefined && typeof dados.modoAutomatico !== "boolean") {
        erros.push("modoAutomatico deve ser boolean");
    }

    if (dados.pausaMovimento !== undefined && typeof dados.pausaMovimento !== "boolean") {
        erros.push("pausaMovimento deve ser boolean");
    }

    return {
        valido: erros.length === 0,
        erros,
    };
}

function validarEstado(dados) {
    const erros = [];

    if (typeof dados !== "object" || dados === null) {
        return {
            valido: false,
            erros: ["A mensagem precisa ser um objeto JSON"],
        };
    }

    if (typeof dados.alarmeAtivo !== "boolean") {
        erros.push("alarmeAtivo deve ser boolean");
    }

    if (dados.modoAutomatico !== undefined && typeof dados.modoAutomatico !== "boolean") {
        erros.push("modoAutomatico deve ser boolean");
    }

    if (dados.pausaMovimento !== undefined && typeof dados.pausaMovimento !== "boolean") {
        erros.push("pausaMovimento deve ser boolean");
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
