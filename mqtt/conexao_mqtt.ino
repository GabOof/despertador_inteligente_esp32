#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

// =====================================================
// DISPOSITIVO
// =====================================================

const char *DEVICE_ID = "esp32-01";

// =====================================================
// TOPICOS MQTT
// =====================================================

const char *TOPICO_TELEMETRIA =
    "despertador/gab/esp32-01/telemetria";

const char *TOPICO_COMANDO =
    "despertador/gab/esp32-01/comando";

const char *TOPICO_ESTADO =
    "despertador/gab/esp32-01/estado";

// =====================================================
// PINOS
// =====================================================

const int PINO_PIR = 27;

const int LED_VERDE = 25;

const int LED_VERMELHO = 32;

const int PINO_BUZZER = 12;

// =====================================================
// MQTT
// =====================================================

WiFiClientSecure wifiClient;

PubSubClient mqtt(
    wifiClient);

// =====================================================
// ESTADOS DO SISTEMA
// =====================================================

bool alarmeAtivo = false;

bool modoAutomatico = false;

bool pausaPorMovimento = false;

bool wifiEstavaConectado = false;

int movimentoAnterior = LOW;

// =====================================================
// TEMPORIZADORES
// =====================================================

unsigned long ultimaTentativaMQTT = 0;

unsigned long ultimaTelemetria = 0;

unsigned long inicioPausaMovimento = 0;

const unsigned long INTERVALO_MQTT =
    5000;

const unsigned long INTERVALO_TELEMETRIA =
    10000;

// Durante os testes:
// 10 segundos

const unsigned long TEMPO_PAUSA_MOVIMENTO =
    10UL * 1000UL;

/*
    Quando terminar os testes e quiser
    voltar para 5 minutos:

    const unsigned long TEMPO_PAUSA_MOVIMENTO =
        5UL * 60UL * 1000UL;
*/

// =====================================================
// DIAGNOSTICO WIFI
// =====================================================

void mostrarDiagnostico()
{
    Serial.println();

    Serial.println(
        "======= DIAGNOSTICO DE REDE =======");

    Serial.print(
        "SSID: ");

    Serial.println(
        WiFi.SSID());

    Serial.print(
        "IP: ");

    Serial.println(
        WiFi.localIP());

    Serial.print(
        "Gateway: ");

    Serial.println(
        WiFi.gatewayIP());

    Serial.print(
        "RSSI: ");

    Serial.print(
        WiFi.RSSI());

    Serial.println(
        " dBm");

    Serial.println(
        "===================================");
}

// =====================================================
// ATIVAR ALARME
// =====================================================

void ativarAlarme()
{
    alarmeAtivo = true;

    ledcWriteTone(
        PINO_BUZZER,
        440);

    Serial.println(
        "ALARME ATIVADO");
}

// =====================================================
// DESATIVAR ALARME
// =====================================================

void desativarAlarme()
{
    alarmeAtivo = false;

    ledcWriteTone(
        PINO_BUZZER,
        0);

    Serial.println(
        "ALARME DESATIVADO");
}

// =====================================================
// ATIVAR MODO AUTOMATICO
// =====================================================

void ativarModoAutomatico()
{
    modoAutomatico = true;

    pausaPorMovimento = false;

    Serial.println(
        "MODO AUTOMATICO ATIVADO");

    ativarAlarme();
}

// =====================================================
// PUBLICAR ESTADO / CONFIRMACAO
// =====================================================

void publicarEstado(
    const char *requestId,
    const char *comando,
    bool executado,
    const char *motivo)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["deviceId"] =
        DEVICE_ID;

    json["requestId"] =
        requestId;

    json["comando"] =
        comando;

    json["executado"] =
        executado;

    json["alarmeAtivo"] =
        alarmeAtivo;

    json["modoAutomatico"] =
        modoAutomatico;

    json["pausaMovimento"] =
        pausaPorMovimento;

    json["motivo"] =
        motivo;

    char mensagem[384];

    size_t tamanho =
        serializeJson(
            json,
            mensagem,
            sizeof(mensagem));

    bool publicado =
        mqtt.publish(
            TOPICO_ESTADO,
            (uint8_t *)mensagem,
            tamanho,
            true);

    Serial.print(
        "Confirmacao: ");

    Serial.print(
        mensagem);

    Serial.println(
        publicado
            ? " [enviada]"
            : " [falhou]");
}

// =====================================================
// PUBLICAR TELEMETRIA
// =====================================================

void publicarTelemetria(
    int movimento)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["deviceId"] =
        DEVICE_ID;

    json["movimento"] =
        movimento == HIGH;

    json["ledVerde"] =
        digitalRead(
            LED_VERDE) == HIGH;

    json["ledVermelho"] =
        digitalRead(
            LED_VERMELHO) == HIGH;

    json["alarmeAtivo"] =
        alarmeAtivo;

    json["modoAutomatico"] =
        modoAutomatico;

    json["pausaMovimento"] =
        pausaPorMovimento;

    json["rssi"] =
        WiFi.RSSI();

    json["uptimeMs"] =
        millis();

    char mensagem[384];

    size_t tamanho =
        serializeJson(
            json,
            mensagem,
            sizeof(mensagem));

    bool publicado =
        mqtt.publish(
            TOPICO_TELEMETRIA,
            (uint8_t *)mensagem,
            tamanho,
            false);

    if (!publicado)
    {
        Serial.println(
            "Falha ao publicar telemetria");
    }
}

// =====================================================
// RECEBER COMANDO MQTT
// =====================================================

void receberMensagem(
    char *topic,
    byte *payload,
    unsigned int length)
{
    JsonDocument json;

    DeserializationError erro =
        deserializeJson(
            json,
            payload,
            length);

    if (erro)
    {
        Serial.println(
            "JSON INVALIDO");

        return;
    }

    const char *comando =
        json["comando"] | "";

    const char *requestId =
        json["requestId"] | "sem-id";

    Serial.println();

    Serial.println(
        "=== COMANDO RECEBIDO ===");

    Serial.print(
        "RequestId: ");

    Serial.println(
        requestId);

    Serial.print(
        "Comando: ");

    Serial.println(
        comando);

    // =================================================
    // LIGAR ALARME
    // =================================================

    if (
        strcmp(
            comando,
            "ligar_alarme") == 0)
    {
        // O comando manual cancela
        // o modo automatico.

        modoAutomatico =
            false;

        pausaPorMovimento =
            false;

        ativarAlarme();

        // Confirma somente depois
        // de executar a acao.

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // =================================================
    // DESLIGAR ALARME
    // =================================================

    if (
        strcmp(
            comando,
            "desligar_alarme") == 0)
    {
        modoAutomatico =
            false;

        pausaPorMovimento =
            false;

        desativarAlarme();

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // =================================================
    // MODO AUTOMATICO
    // =================================================

    if (
        strcmp(
            comando,
            "automatico") == 0)
    {
        ativarModoAutomatico();

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // =================================================
    // COMANDO INVALIDO
    // =================================================

    Serial.println(
        "COMANDO NAO SUPORTADO");

    publicarEstado(
        requestId,
        comando,
        false,
        "comando_nao_suportado");
}

// =====================================================
// CONECTAR MQTT
// =====================================================

void conectarMQTT()
{
    if (
        WiFi.status() != WL_CONNECTED)
    {
        return;
    }

    if (
        mqtt.connected())
    {
        return;
    }

    Serial.println(
        "Conectando ao HiveMQ...");

    bool conectado =
        mqtt.connect(
            "esp32-despertador-gab-01",
            MQTT_USERNAME,
            MQTT_PASSWORD);

    if (!conectado)
    {
        Serial.print(
            "Falha MQTT. Codigo: ");

        Serial.println(
            mqtt.state());

        return;
    }

    Serial.println(
        "MQTT conectado!");

    // =================================================
    // ASSINAR COMANDOS
    // =================================================

    bool inscrito =
        mqtt.subscribe(
            TOPICO_COMANDO,
            1);

    if (inscrito)
    {
        Serial.println(
            "Topico de comandos assinado.");
    }
    else
    {
        Serial.println(
            "Falha ao assinar topico.");
    }

    // =================================================
    // ESTADO INICIAL
    // =================================================

    /*
        Esta mensagem substitui o antigo
        retained no topico /estado.

        O Gateway reconhece "startup"
        como estado inicial e não como
        um comando do usuario.
    */

    publicarEstado(
        "startup",
        "estado_inicial",
        true,
        "mqtt_conectado");
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
    Serial.begin(
        115200);

    delay(
        1000);

    Serial.println();

    Serial.println(
        "=====================================");

    Serial.println(
        "DESPERTADOR INTELIGENTE ESP32");

    Serial.println(
        "=====================================");

    // =================================================
    // PIR
    // =================================================

    pinMode(
        PINO_PIR,
        INPUT);

    // =================================================
    // LEDS
    // =================================================

    pinMode(
        LED_VERDE,
        OUTPUT);

    pinMode(
        LED_VERMELHO,
        OUTPUT);

    digitalWrite(
        LED_VERDE,
        LOW);

    digitalWrite(
        LED_VERMELHO,
        HIGH);

    // =================================================
    // BUZZER
    // =================================================

    bool buzzerConfigurado =
        ledcAttach(
            PINO_BUZZER,
            1000,
            8);

    if (
        buzzerConfigurado)
    {
        Serial.println(
            "Buzzer configurado.");
    }
    else
    {
        Serial.println(
            "Erro ao configurar buzzer.");
    }

    ledcWriteTone(
        PINO_BUZZER,
        0);

    // =================================================
    // ESTADO INICIAL DO PIR
    // =================================================

    movimentoAnterior =
        digitalRead(
            PINO_PIR);

    // =================================================
    // WIFI
    // =================================================

    WiFi.mode(
        WIFI_STA);

    WiFi.setAutoReconnect(
        true);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD);

    Serial.println(
        "Conectando ao Wi-Fi...");

    // =================================================
    // TLS
    // =================================================

    /*
        Para o projeto academico estamos
        utilizando conexao TLS sem validar
        manualmente o certificado.
    */

    wifiClient.setInsecure();

    // =================================================
    // MQTT
    // =================================================

    mqtt.setServer(
        MQTT_HOST,
        MQTT_PORT);

    mqtt.setCallback(
        receberMensagem);

    mqtt.setBufferSize(
        512);
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
    // =================================================
    // WIFI
    // =================================================

    bool wifiConectado =
        WiFi.status() == WL_CONNECTED;

    // ---------------------------------------------
    // CONECTOU
    // ---------------------------------------------

    if (
        wifiConectado &&
        !wifiEstavaConectado)
    {
        wifiEstavaConectado =
            true;

        Serial.println();

        Serial.println(
            "Wi-Fi conectado!");

        mostrarDiagnostico();
    }

    // ---------------------------------------------
    // DESCONECTOU
    // ---------------------------------------------

    if (
        !wifiConectado &&
        wifiEstavaConectado)
    {
        wifiEstavaConectado =
            false;

        Serial.println(
            "Wi-Fi desconectado!");
    }

    // =================================================
    // MQTT
    // =================================================

    if (
        wifiConectado &&
        !mqtt.connected())
    {
        unsigned long agora =
            millis();

        if (
            agora -
                ultimaTentativaMQTT >=
            INTERVALO_MQTT)
        {
            ultimaTentativaMQTT =
                agora;

            conectarMQTT();
        }
    }

    if (
        mqtt.connected())
    {
        mqtt.loop();
    }

    // =================================================
    // LEITURA PIR
    // =================================================

    int movimento =
        digitalRead(
            PINO_PIR);

    // Detecta somente a transicao:
    //
    // LOW -> HIGH

    bool novoMovimento =
        movimento == HIGH &&
        movimentoAnterior == LOW;

    // =================================================
    // LEDS
    // =================================================

    if (
        movimento == HIGH)
    {
        digitalWrite(
            LED_VERDE,
            HIGH);

        digitalWrite(
            LED_VERMELHO,
            LOW);
    }
    else
    {
        digitalWrite(
            LED_VERDE,
            LOW);

        digitalWrite(
            LED_VERMELHO,
            HIGH);
    }

    // =================================================
    // MODO AUTOMATICO
    // =================================================

    if (
        modoAutomatico)
    {
        // ---------------------------------------------
        // MOVIMENTO DETECTADO
        // ---------------------------------------------

        if (
            novoMovimento &&
            !pausaPorMovimento)
        {
            Serial.println();

            Serial.println(
                "MOVIMENTO DETECTADO");

            Serial.println(
                "Pausando alarme por 10 segundos...");

            // Para o buzzer.
            desativarAlarme();

            // Mantém o modo automático ativo.
            pausaPorMovimento =
                true;

            inicioPausaMovimento =
                millis();

            // Não é uma confirmação de
            // comando do Gateway.
            //
            // É um evento interno do ESP32.

            publicarEstado(
                "evento",
                "automatico",
                true,
                "movimento_detectado");
        }

        // ---------------------------------------------
        // VERIFICAR FIM DA PAUSA
        // ---------------------------------------------

        if (
            pausaPorMovimento)
        {
            unsigned long tempoPassado =
                millis() -
                inicioPausaMovimento;

            if (
                tempoPassado >=
                TEMPO_PAUSA_MOVIMENTO)
            {
                pausaPorMovimento =
                    false;

                Serial.println();

                Serial.println(
                    "Fim da pausa de 10 segundos.");

                Serial.println(
                    "Buzzer voltando a tocar...");

                ativarAlarme();

                publicarEstado(
                    "evento",
                    "automatico",
                    true,
                    "fim_da_pausa");
            }
        }
    }

    // =================================================
    // TELEMETRIA QUANDO PIR MUDA
    // =================================================

    if (
        movimento !=
        movimentoAnterior)
    {
        publicarTelemetria(
            movimento);

        movimentoAnterior =
            movimento;
    }

    // =================================================
    // TELEMETRIA PERIODICA
    // =================================================

    unsigned long agora =
        millis();

    if (
        agora -
            ultimaTelemetria >=
        INTERVALO_TELEMETRIA)
    {
        ultimaTelemetria =
            agora;

        publicarTelemetria(
            movimento);
    }

    // Delay pequeno apenas para estabilidade.
    delay(
        20);
}
