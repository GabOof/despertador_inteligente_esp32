#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// =====================================================
// WIFI
// =====================================================

const char *ssid = "SEU_WIFI";
const char *senha = "SUA_SENHA_WIFI";

// =====================================================
// MQTT - HIVEMQ CLOUD
// =====================================================

const char *broker =
    "SEU_BROKER.s1.eu.hivemq.cloud";

const int portaMQTT = 8883;

const char *usuarioMQTT =
    "SEU_USUARIO";

const char *senhaMQTT =
    "SUA_SENHA_MQTT";

// =====================================================
// TOPICOS MQTT
// =====================================================

const char *topicoTelemetria =
    "despertador/gab/esp32-01/telemetria";

const char *topicoComando =
    "despertador/gab/esp32-01/comando";

const char *topicoEstado =
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
// ESTADOS
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

// 5 minutos
const unsigned long TEMPO_PAUSA_MOVIMENTO =
    5UL * 60UL * 1000UL;

// =====================================================
// DIAGNOSTICO
// =====================================================

void mostrarDiagnostico()
{
    Serial.println();
    Serial.println(
        "======= DIAGNOSTICO DE REDE =======");

    Serial.println(
        "Status: CONECTADO");

    Serial.print("SSID: ");
    Serial.println(
        WiFi.SSID());

    Serial.print("IP: ");
    Serial.println(
        WiFi.localIP());

    Serial.print("Gateway: ");
    Serial.println(
        WiFi.gatewayIP());

    Serial.print("RSSI: ");
    Serial.print(
        WiFi.RSSI());

    Serial.println(" dBm");

    Serial.println(
        "===================================");
}

// =====================================================
// BUZZER
// =====================================================

void ativarAlarme()
{
    alarmeAtivo = true;

    ledcWriteTone(
        PINO_BUZZER,
        440);

    Serial.println();
    Serial.println(
        "ALARME ATIVADO!");
}

void desativarAlarme()
{
    alarmeAtivo = false;

    ledcWriteTone(
        PINO_BUZZER,
        0);

    Serial.println();
    Serial.println(
        "ALARME DESATIVADO!");
}

// =====================================================
// MODO AUTOMATICO
// =====================================================

void ativarModoAutomatico()
{
    modoAutomatico = true;

    pausaPorMovimento = false;

    Serial.println();
    Serial.println(
        "MODO AUTOMATICO ATIVADO!");

    ativarAlarme();
}

// =====================================================
// PUBLICAR ESTADO
// =====================================================

void publicarEstado()
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["alarmeAtivo"] =
        alarmeAtivo;

    json["modoAutomatico"] =
        modoAutomatico;

    json["pausaMovimento"] =
        pausaPorMovimento;

    String mensagem;

    serializeJson(
        json,
        mensagem);

    mqtt.publish(
        topicoEstado,
        mensagem.c_str());

    Serial.print(
        "Estado enviado: ");

    Serial.println(
        mensagem);
}

// =====================================================
// TELEMETRIA
// =====================================================

void publicarTelemetria(
    int movimento)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

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

    String mensagem;

    serializeJson(
        json,
        mensagem);

    mqtt.publish(
        topicoTelemetria,
        mensagem.c_str());

    Serial.print(
        "Telemetria: ");

    Serial.println(
        mensagem);
}

// =====================================================
// RECEBER MQTT
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
            "JSON invalido!");

        return;
    }

    const char *comando =
        json["comando"] | "";

    Serial.println();

    Serial.print(
        "Comando recebido: ");

    Serial.println(
        comando);

    // ---------------------------------------------
    // LIGAR MANUALMENTE
    // ---------------------------------------------

    if (
        strcmp(
            comando,
            "ligar_alarme") == 0)
    {
        modoAutomatico = false;

        pausaPorMovimento = false;

        ativarAlarme();

        publicarEstado();
    }

    // ---------------------------------------------
    // DESLIGAR
    // ---------------------------------------------

    else if (
        strcmp(
            comando,
            "desligar_alarme") == 0)
    {
        modoAutomatico = false;

        pausaPorMovimento = false;

        desativarAlarme();

        publicarEstado();
    }

    // ---------------------------------------------
    // AUTOMATICO
    // ---------------------------------------------

    else if (
        strcmp(
            comando,
            "automatico") == 0)
    {
        ativarModoAutomatico();

        publicarEstado();
    }

    else
    {
        Serial.println(
            "Comando desconhecido.");
    }
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

    Serial.println(
        "Conectando ao HiveMQ...");

    if (
        mqtt.connect(
            "esp32-despertador-gab",
            usuarioMQTT,
            senhaMQTT))
    {
        Serial.println(
            "MQTT conectado!");

        mqtt.subscribe(
            topicoComando);

        Serial.println(
            "Inscrito no topico de comandos.");

        publicarEstado();
    }
    else
    {
        Serial.print(
            "Falha MQTT. Codigo: ");

        Serial.println(
            mqtt.state());
    }
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    // ---------------------------------------------
    // PIR
    // ---------------------------------------------

    pinMode(
        PINO_PIR,
        INPUT);

    // ---------------------------------------------
    // LEDS
    // ---------------------------------------------

    pinMode(
        LED_VERDE,
        OUTPUT);

    pinMode(
        LED_VERMELHO,
        OUTPUT);

    // ---------------------------------------------
    // BUZZER
    // ---------------------------------------------

    ledcAttach(
        PINO_BUZZER,
        1000,
        8);

    ledcWriteTone(
        PINO_BUZZER,
        0);

    // ---------------------------------------------
    // ESTADO INICIAL DO PIR
    // ---------------------------------------------

    movimentoAnterior =
        digitalRead(
            PINO_PIR);

    // ---------------------------------------------
    // WIFI
    // ---------------------------------------------

    WiFi.mode(
        WIFI_STA);

    WiFi.setAutoReconnect(
        true);

    WiFi.begin(
        ssid,
        senha);

    Serial.println();
    Serial.println(
        "=== DESPERTADOR INTELIGENTE ===");

    Serial.println(
        "Conectando ao Wi-Fi...");

    // ---------------------------------------------
    // TLS
    // ---------------------------------------------

    wifiClient.setInsecure();

    // ---------------------------------------------
    // MQTT
    // ---------------------------------------------

    mqtt.setServer(
        broker,
        portaMQTT);

    mqtt.setCallback(
        receberMensagem);
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

    if (
        wifiConectado &&
        !wifiEstavaConectado)
    {
        Serial.println();
        Serial.println(
            "Wi-Fi conectado!");

        mostrarDiagnostico();

        wifiEstavaConectado =
            true;
    }

    if (
        !wifiConectado &&
        wifiEstavaConectado)
    {
        Serial.println();
        Serial.println(
            "Wi-Fi desconectado!");

        wifiEstavaConectado =
            false;
    }

    // =================================================
    // MQTT
    // =================================================

    if (
        wifiConectado &&
        !mqtt.connected())
    {
        if (
            millis() -
                ultimaTentativaMQTT >=
            INTERVALO_MQTT)
        {
            ultimaTentativaMQTT =
                millis();

            conectarMQTT();
        }
    }

    if (
        mqtt.connected())
    {
        mqtt.loop();
    }

    // =================================================
    // PIR
    // =================================================

    int movimento =
        digitalRead(
            PINO_PIR);

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

    if (modoAutomatico)
    {
        // Detectou movimento
        if (
            novoMovimento &&
            !pausaPorMovimento)
        {
            Serial.println();
            Serial.println(
                "Movimento detectado!");

            Serial.println(
                "Alarme pausado por 5 minutos.");

            desativarAlarme();

            pausaPorMovimento =
                true;

            inicioPausaMovimento =
                millis();

            publicarEstado();
        }

        // Verifica fim da pausa
        if (
            pausaPorMovimento)
        {
            if (
                millis() -
                    inicioPausaMovimento >=
                TEMPO_PAUSA_MOVIMENTO)
            {
                pausaPorMovimento =
                    false;

                Serial.println();
                Serial.println(
                    "Fim da pausa.");

                ativarAlarme();

                publicarEstado();
            }
        }
    }

    // =================================================
    // TELEMETRIA POR MUDANCA
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

    if (
        millis() -
            ultimaTelemetria >=
        INTERVALO_TELEMETRIA)
    {
        ultimaTelemetria =
            millis();

        publicarTelemetria(
            movimento);
    }

    delay(20);
}
