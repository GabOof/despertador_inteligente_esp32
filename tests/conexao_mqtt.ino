#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// =====================================================
// WIFI
// =====================================================

const char *ssid = "wifi-labs-ifmg";
const char *senha = "SENHA AQUI";

// =====================================================
// MQTT - HIVEMQ CLOUD
// =====================================================

const char *broker =
    "543ccac868094f998ea646be2761494b.s1.eu.hivemq.cloud";

const int portaMQTT = 8883;

const char *usuarioMQTT = "esp32";
const char *senhaMQTT = "SENHA AQUI";

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
PubSubClient mqtt(wifiClient);

// =====================================================
// ESTADOS
// =====================================================

// Indica se o buzzer está tocando
bool alarmeAtivo = false;

// Indica se estamos no modo automático
bool modoAutomatico = false;

// Indica se o despertador está na pausa
// provocada pela detecção de movimento
bool pausaPorMovimento = false;

// Estado anterior do PIR
int movimentoAnterior = LOW;

// Estado anterior do Wi-Fi
bool wifiEstavaConectado = false;

// =====================================================
// TEMPORIZADORES
// =====================================================

unsigned long ultimaTentativaMQTT = 0;
unsigned long ultimaTelemetria = 0;

unsigned long inicioPausaMovimento = 0;

const unsigned long INTERVALO_MQTT = 5000;

const unsigned long INTERVALO_TELEMETRIA = 10000;

// 10 segundos
const unsigned long TEMPO_PAUSA_MOVIMENTO =
    10UL * 1000UL;

// =====================================================
// DIAGNOSTICO WIFI
// =====================================================

void mostrarDiagnostico()
{
    Serial.println();
    Serial.println("======= DIAGNOSTICO DE REDE =======");

    Serial.println("Status: CONECTADO");

    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());

    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    Serial.println("===================================");
}

// =====================================================
// ATIVAR ALARME
// =====================================================

void ativarAlarme()
{
    alarmeAtivo = true;

    uint32_t frequencia =
        ledcWriteTone(
            PINO_BUZZER,
            440);

    Serial.println();
    Serial.println("ALARME ATIVADO!");

    Serial.print("Frequencia do buzzer: ");
    Serial.println(frequencia);
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

    Serial.println();
    Serial.println("ALARME DESATIVADO!");
}

// =====================================================
// ATIVAR MODO AUTOMATICO
// =====================================================

void ativarModoAutomatico()
{
    modoAutomatico = true;

    pausaPorMovimento = false;

    Serial.println();
    Serial.println("===============================");
    Serial.println("MODO AUTOMATICO ATIVADO!");
    Serial.println("===============================");

    // Ao entrar no modo automático,
    // o alarme começa tocando
    ativarAlarme();
}

// =====================================================
// DESATIVAR MODO AUTOMATICO
// =====================================================

void desativarModoAutomatico()
{
    modoAutomatico = false;

    pausaPorMovimento = false;

    desativarAlarme();

    Serial.println(
        "Modo automatico desativado.");
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

    Serial.print("Estado enviado: ");
    Serial.println(mensagem);
}

// =====================================================
// PUBLICAR TELEMETRIA
// =====================================================

void publicarTelemetria(int movimento)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["movimento"] =
        movimento == HIGH;

    json["ledVerde"] =
        digitalRead(LED_VERDE) == HIGH;

    json["ledVermelho"] =
        digitalRead(LED_VERMELHO) == HIGH;

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

    Serial.print("Telemetria: ");
    Serial.println(mensagem);
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
            "JSON invalido!");

        return;
    }

    const char *comando =
        json["comando"] | "";

    Serial.println();
    Serial.print("Comando recebido: ");
    Serial.println(comando);

    // =================================================
    // LIGAR ALARME MANUALMENTE
    // =================================================

    if (
        strcmp(
            comando,
            "ligar_alarme") == 0)
    {
        // Sai do modo automático
        modoAutomatico = false;

        pausaPorMovimento = false;

        ativarAlarme();

        publicarEstado();
    }

    // =================================================
    // DESLIGAR ALARME
    // =================================================

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

    // =================================================
    // MODO AUTOMATICO
    // =================================================

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

    delay(1000);

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
        LOW);

    // =================================================
    // BUZZER
    // =================================================

    Serial.println();
    Serial.println(
        "Configurando buzzer...");

    bool buzzerConfigurado =
        ledcAttach(
            PINO_BUZZER,
            1000,
            8);

    if (buzzerConfigurado)
    {
        Serial.println(
            "Buzzer configurado!");
    }
    else
    {
        Serial.println(
            "ERRO ao configurar buzzer!");
    }

    // Buzzer começa desligado
    ledcWriteTone(
        PINO_BUZZER,
        0);

    // =================================================
    // TESTE RAPIDO DO BUZZER
    // =================================================

    Serial.println(
        "Testando buzzer...");

    ledcWriteTone(
        PINO_BUZZER,
        440);

    delay(1000);

    ledcWriteTone(
        PINO_BUZZER,
        0);

    Serial.println(
        "Teste finalizado.");

    // =================================================
    // ESTADO INICIAL DO PIR
    // =================================================

    movimentoAnterior =
        digitalRead(PINO_PIR);

    // =================================================
    // WIFI
    // =================================================

    WiFi.mode(
        WIFI_STA);

    WiFi.setAutoReconnect(
        true);

    WiFi.begin(
        ssid,
        senha);

    Serial.println();
    Serial.println(
        "Conectando ao Wi-Fi...");

    // =================================================
    // TLS
    // =================================================

    wifiClient.setInsecure();

    // =================================================
    // MQTT
    // =================================================

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

        wifiEstavaConectado = true;
    }

    if (
        !wifiConectado &&
        wifiEstavaConectado)
    {
        Serial.println();
        Serial.println(
            "Wi-Fi desconectado!");

        Serial.println(
            "Aguardando reconexao...");

        wifiEstavaConectado = false;
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

    if (mqtt.connected())
    {
        mqtt.loop();
    }

    // =================================================
    // SENSOR PIR
    // =================================================

    int movimento =
        digitalRead(
            PINO_PIR);

    // Verifica se aconteceu uma NOVA detecção
    // LOW -> HIGH
    bool novoMovimento =
        movimento == HIGH &&
        movimentoAnterior == LOW;

    // =================================================
    // LEDS
    // =================================================

    if (movimento == HIGH)
    {
        // Movimento
        digitalWrite(
            LED_VERDE,
            HIGH);

        digitalWrite(
            LED_VERMELHO,
            LOW);
    }
    else
    {
        // Sem movimento
        digitalWrite(
            LED_VERDE,
            LOW);

        digitalWrite(
            LED_VERMELHO,
            HIGH);
    }

    // =================================================
    // LOGICA DO MODO AUTOMATICO
    // =================================================

    if (modoAutomatico)
    {
        // ---------------------------------------------
        // DETECTOU MOVIMENTO
        // ---------------------------------------------

        if (
            novoMovimento &&
            !pausaPorMovimento)
        {
            Serial.println();
            Serial.println(
                "MOVIMENTO DETECTADO!");

            Serial.println(
                "Pausando alarme por 5 minutos...");

            // Para o buzzer
            desativarAlarme();

            // IMPORTANTE:
            // desativarAlarme() muda alarmeAtivo,
            // mas NÃO desliga o modo automático.

            pausaPorMovimento = true;

            inicioPausaMovimento =
                millis();

            publicarEstado();
        }

        // ---------------------------------------------
        // PAUSA ATIVA
        // ---------------------------------------------

        if (pausaPorMovimento)
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
                    "Fim da pausa de 5 minutos!");

                Serial.println(
                    "Buzzer voltando a tocar...");

                ativarAlarme();

                publicarEstado();
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

        // Atualizamos somente DEPOIS
        // da lógica do modo automático
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
