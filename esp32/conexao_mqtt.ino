#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// -------------------------
// Wi-Fi
// -------------------------

const char *ssid = "wifi-labs-ifmg";
const char *senhaWiFi = "SENHA AQUI";

// -------------------------
// HiveMQ Cloud
// -------------------------

const char *broker = "543ccac868094f998ea646be2761494b.s1.eu.hivemq.cloud";

const int portaMQTT = 8883;

const char *usuarioMQTT = "esp32";
const char *senhaMQTT = "SENHA AQUI";

// -------------------------
// Tópicos MQTT
// -------------------------

const char *topicoTelemetria =
    "despertador/gab/esp32-01/telemetria";

const char *topicoComando =
    "despertador/gab/esp32-01/comando";

const char *topicoEstado =
    "despertador/gab/esp32-01/estado";

// -------------------------
// Pinos
// -------------------------

const int sensorPIR = 27;
const int ledVerde = 25;
const int ledVermelho = 32;

// -------------------------
// MQTT
// -------------------------

WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

// -------------------------
// Estados
// -------------------------

int movimentoAnterior = -1;

bool modoManual = false;

// -------------------------
// Publica estado dos LEDs
// -------------------------

void publicarEstado()
{
    String mensagem = "{";

    mensagem += "\"modo\":\"";
    mensagem += modoManual ? "manual" : "automatico";
    mensagem += "\",";

    mensagem += "\"ledVerde\":";
    mensagem += digitalRead(ledVerde) == HIGH
                    ? "true"
                    : "false";

    mensagem += ",";

    mensagem += "\"ledVermelho\":";
    mensagem += digitalRead(ledVermelho) == HIGH
                    ? "true"
                    : "false";

    mensagem += "}";

    mqtt.publish(
        topicoEstado,
        mensagem.c_str());

    Serial.print("Estado enviado: ");
    Serial.println(mensagem);
}

// -------------------------
// Recebe comando MQTT
// -------------------------

void receberMensagem(
    char *topic,
    byte *payload,
    unsigned int length)
{
    String mensagem = "";

    for (int i = 0; i < length; i++)
    {
        mensagem += (char)payload[i];
    }

    Serial.println();
    Serial.print("Comando recebido: ");
    Serial.println(mensagem);

    if (mensagem == "{\"comando\":\"verde\"}")
    {
        modoManual = true;

        digitalWrite(ledVerde, HIGH);
        digitalWrite(ledVermelho, LOW);

        Serial.println("LED verde ligado remotamente!");

        publicarEstado();
    }

    else if (
        mensagem == "{\"comando\":\"vermelho\"}")
    {
        modoManual = true;

        digitalWrite(ledVerde, LOW);
        digitalWrite(ledVermelho, HIGH);

        Serial.println(
            "LED vermelho ligado remotamente!");

        publicarEstado();
    }

    else if (
        mensagem == "{\"comando\":\"automatico\"}")
    {
        modoManual = false;

        Serial.println(
            "Modo automatico ativado!");

        publicarEstado();
    }

    else
    {
        Serial.println("Comando desconhecido.");
    }
}

// -------------------------
// Conecta ao MQTT
// -------------------------

void conectarMQTT()
{
    Serial.println(
        "Conectando ao HiveMQ Cloud...");

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
    }
    else
    {
        Serial.print(
            "Falha MQTT. Codigo: ");

        Serial.println(
            mqtt.state());
    }
}

// -------------------------
// Publica telemetria
// -------------------------

void publicarTelemetria(int movimento)
{
    String mensagem = "{";

    mensagem += "\"movimento\":";

    mensagem += movimento == HIGH
                    ? "true"
                    : "false";

    mensagem += ",";

    mensagem += "\"ledVerde\":";

    mensagem += digitalRead(ledVerde) == HIGH
                    ? "true"
                    : "false";

    mensagem += ",";

    mensagem += "\"ledVermelho\":";

    mensagem += digitalRead(ledVermelho) == HIGH
                    ? "true"
                    : "false";

    mensagem += "}";

    mqtt.publish(
        topicoTelemetria,
        mensagem.c_str());

    Serial.print(
        "Telemetria enviada: ");

    Serial.println(mensagem);
}

// -------------------------
// Setup
// -------------------------

void setup()
{
    Serial.begin(115200);

    pinMode(sensorPIR, INPUT);
    pinMode(ledVerde, OUTPUT);
    pinMode(ledVermelho, OUTPUT);

    digitalWrite(ledVerde, LOW);
    digitalWrite(ledVermelho, LOW);

    // Wi-Fi
    WiFi.begin(
        ssid,
        senhaWiFi);

    Serial.println(
        "Conectando ao Wi-Fi...");

    while (
        WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println(
        "Wi-Fi conectado!");

    Serial.print("IP: ");
    Serial.println(
        WiFi.localIP());

    // TLS
    wifiClient.setInsecure();

    // MQTT
    mqtt.setServer(
        broker,
        portaMQTT);

    mqtt.setCallback(
        receberMensagem);

    conectarMQTT();
}

// -------------------------
// Loop
// -------------------------

void loop()
{
    // Reconecta ao Wi-Fi
    if (
        WiFi.status() != WL_CONNECTED)
    {
        Serial.println(
            "Wi-Fi desconectado!");

        WiFi.reconnect();

        delay(2000);

        return;
    }

    // Reconecta ao MQTT
    if (!mqtt.connected())
    {
        conectarMQTT();

        delay(2000);

        return;
    }

    mqtt.loop();

    int movimento =
        digitalRead(sensorPIR);

    // PIR só controla os LEDs
    // quando estiver no modo automático
    if (!modoManual)
    {
        if (movimento == HIGH)
        {
            digitalWrite(
                ledVerde,
                HIGH);

            digitalWrite(
                ledVermelho,
                LOW);
        }
        else
        {
            digitalWrite(
                ledVerde,
                LOW);

            digitalWrite(
                ledVermelho,
                HIGH);
        }
    }

    // Publica apenas quando
    // o estado do sensor mudar
    if (
        movimento != movimentoAnterior)
    {
        movimentoAnterior = movimento;

        publicarTelemetria(
            movimento);
    }

    delay(100);
}
