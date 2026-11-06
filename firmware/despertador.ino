#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

// =====================================================
// CONFIGURACAO
// =====================================================

const char *DEVICE_ID = "esp32-01";

const char *TOPICO_TELEMETRIA =
    "despertador/gab/esp32-01/telemetria";

const char *TOPICO_COMANDO =
    "despertador/gab/esp32-01/comando";

const char *TOPICO_ESTADO =
    "despertador/gab/esp32-01/estado";

// Pinos
const int PIR = 27;
const int LED_VERDE = 25;
const int LED_VERMELHO = 32;
const int BUZZER = 12;

// Tempos
const unsigned long TELEMETRIA_MS = 10000;
const unsigned long RECONEXAO_MS = 5000;

// 10 segundos para facilitar a demonstracao.
const unsigned long PAUSA_MS = 10000;

// =====================================================
// OBJETOS
// =====================================================

WiFiClientSecure wifi;
PubSubClient mqtt(wifi);

// =====================================================
// ESTADO
// =====================================================

bool alarmeAtivo = false;
bool modoAutomatico = false;
bool pausaMovimento = false;

int movimentoAnterior = LOW;

unsigned long ultimaTelemetria = 0;
unsigned long ultimaReconexao = 0;
unsigned long inicioPausa = 0;

// =====================================================
// BUZZER
// =====================================================

void definirAlarme(bool ligado)
{
    alarmeAtivo = ligado;

    if (ligado)
    {
        ledcWriteTone(BUZZER, 440);
    }
    else
    {
        ledcWriteTone(BUZZER, 0);
    }
}

// =====================================================
// PUBLICAR ESTADO
// =====================================================

void publicarEstado(
    const char *requestId,
    const char *comando,
    bool executado,
    const char *motivo)
{
    if (!mqtt.connected())
        return;

    JsonDocument json;

    json["deviceId"] = DEVICE_ID;
    json["requestId"] = requestId;
    json["comando"] = comando;
    json["executado"] = executado;

    json["alarmeAtivo"] = alarmeAtivo;
    json["modoAutomatico"] = modoAutomatico;
    json["pausaMovimento"] = pausaMovimento;

    json["motivo"] = motivo;

    String mensagem;

    serializeJson(
        json,
        mensagem);

    mqtt.publish(
        TOPICO_ESTADO,
        mensagem.c_str(),
        true);

    Serial.print(
        "[ESTADO] ");

    Serial.println(
        mensagem);
}

// =====================================================
// TELEMETRIA
// =====================================================

void publicarTelemetria()
{
    if (!mqtt.connected())
        return;

    JsonDocument json;

    json["deviceId"] = DEVICE_ID;

    json["movimento"] =
        digitalRead(PIR) == HIGH;

    json["ledVerde"] =
        digitalRead(LED_VERDE) == HIGH;

    json["ledVermelho"] =
        digitalRead(LED_VERMELHO) == HIGH;

    json["alarmeAtivo"] =
        alarmeAtivo;

    json["modoAutomatico"] =
        modoAutomatico;

    json["pausaMovimento"] =
        pausaMovimento;

    json["rssi"] =
        WiFi.RSSI();

    String mensagem;

    serializeJson(
        json,
        mensagem);

    mqtt.publish(
        TOPICO_TELEMETRIA,
        mensagem.c_str());
}

// =====================================================
// RECEBER COMANDOS
// =====================================================

void receberMensagem(
    char *topic,
    byte *payload,
    unsigned int length)
{
    JsonDocument json;

    if (
        deserializeJson(
            json,
            payload,
            length))
    {
        Serial.println(
            "[ERRO] JSON invalido");

        return;
    }

    const char *comando =
        json["comando"] | "";

    const char *requestId =
        json["requestId"] | "sem-id";

    Serial.print(
        "[COMANDO] ");

    Serial.println(
        comando);

    // ---------------------------------------------
    // LIGAR
    // ---------------------------------------------

    if (
        strcmp(
            comando,
            "ligar_alarme") == 0)
    {
        modoAutomatico = false;
        pausaMovimento = false;

        definirAlarme(true);

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // ---------------------------------------------
    // DESLIGAR
    // ---------------------------------------------

    if (
        strcmp(
            comando,
            "desligar_alarme") == 0)
    {
        modoAutomatico = false;
        pausaMovimento = false;

        definirAlarme(false);

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // ---------------------------------------------
    // AUTOMATICO
    // ---------------------------------------------

    if (
        strcmp(
            comando,
            "automatico") == 0)
    {
        modoAutomatico = true;
        pausaMovimento = false;

        definirAlarme(true);

        publicarEstado(
            requestId,
            comando,
            true,
            "comando_executado");

        return;
    }

    // ---------------------------------------------
    // INVALIDO
    // ---------------------------------------------

    publicarEstado(
        requestId,
        comando,
        false,
        "comando_invalido");
}

// =====================================================
// MQTT
// =====================================================

void conectarMQTT()
{
    if (
        WiFi.status() != WL_CONNECTED ||
        mqtt.connected())
    {
        return;
    }

    if (
        !mqtt.connect(
            "esp32-despertador-gab",
            MQTT_USERNAME,
            MQTT_PASSWORD))
    {
        return;
    }

    mqtt.subscribe(
        TOPICO_COMANDO);

    Serial.println(
        "[OK] MQTT conectado");

    publicarEstado(
        "startup",
        "estado_inicial",
        true,
        "dispositivo_iniciado");
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    // Hardware
    pinMode(PIR, INPUT);

    pinMode(
        LED_VERDE,
        OUTPUT);

    pinMode(
        LED_VERMELHO,
        OUTPUT);

    ledcAttach(
        BUZZER,
        1000,
        8);

    definirAlarme(false);

    movimentoAnterior =
        digitalRead(PIR);

    // Wi-Fi
    WiFi.mode(WIFI_STA);

    WiFi.setAutoReconnect(true);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD);

    // MQTT TLS
    wifi.setInsecure();

    mqtt.setServer(
        MQTT_HOST,
        MQTT_PORT);

    mqtt.setCallback(
        receberMensagem);

    mqtt.setBufferSize(512);

    Serial.println(
        "Despertador iniciado");
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
    // ---------------------------------------------
    // RECONEXAO
    // ---------------------------------------------

    if (
        WiFi.status() == WL_CONNECTED)
    {
        if (!mqtt.connected())
        {
            if (
                millis() -
                    ultimaReconexao >=
                RECONEXAO_MS)
            {
                ultimaReconexao =
                    millis();

                conectarMQTT();
            }
        }
    }

    if (mqtt.connected())
    {
        mqtt.loop();
    }

    // ---------------------------------------------
    // PIR
    // ---------------------------------------------

    int movimento =
        digitalRead(PIR);

    digitalWrite(
        LED_VERDE,
        movimento == HIGH);

    digitalWrite(
        LED_VERMELHO,
        movimento == LOW);

    bool novoMovimento =
        movimento == HIGH &&
        movimentoAnterior == LOW;

    // ---------------------------------------------
    // MODO AUTOMATICO
    // ---------------------------------------------

    if (modoAutomatico)
    {
        if (
            novoMovimento &&
            !pausaMovimento)
        {
            definirAlarme(false);

            pausaMovimento = true;

            inicioPausa =
                millis();

            publicarEstado(
                "evento",
                "automatico",
                true,
                "movimento_detectado");
        }

        if (
            pausaMovimento &&
            millis() - inicioPausa >=
                PAUSA_MS)
        {
            pausaMovimento = false;

            definirAlarme(true);

            publicarEstado(
                "evento",
                "automatico",
                true,
                "fim_da_pausa");
        }
    }

    // ---------------------------------------------
    // TELEMETRIA QUANDO PIR MUDA
    // ---------------------------------------------

    if (
        movimento !=
        movimentoAnterior)
    {
        movimentoAnterior =
            movimento;

        publicarTelemetria();
    }

    // ---------------------------------------------
    // TELEMETRIA PERIODICA
    // ---------------------------------------------

    if (
        millis() -
            ultimaTelemetria >=
        TELEMETRIA_MS)
    {
        ultimaTelemetria =
            millis();

        publicarTelemetria();
    }

    delay(20);
}
