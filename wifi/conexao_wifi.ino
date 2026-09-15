#include <WiFi.h>

// =====================================================
// WIFI
// =====================================================

const char *ssid = "SEU_WIFI";
const char *senha = "SUA_SENHA";

// Tenta reconectar a cada 5 segundos
const unsigned long INTERVALO_RECONEXAO = 5000;

unsigned long ultimaTentativa = 0;

// Guarda o estado anterior da conexão
bool wifiConectado = false;

// =====================================================
// DIAGNOSTICO
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
// SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        ssid,
        senha);

    Serial.println();
    Serial.println(
        "=== TESTE DE CONEXAO WIFI ===");

    Serial.println(
        "Conectando ao Wi-Fi...");
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
    // ---------------------------------------------
    // WIFI CONECTADO
    // ---------------------------------------------

    if (WiFi.status() == WL_CONNECTED)
    {
        // Mostra somente quando acabou de conectar
        if (!wifiConectado)
        {
            wifiConectado = true;

            Serial.println();
            Serial.println(
                "Wi-Fi conectado com sucesso!");

            mostrarDiagnostico();
        }
    }

    // ---------------------------------------------
    // WIFI DESCONECTADO
    // ---------------------------------------------

    else
    {
        // Detecta a queda da conexão
        if (wifiConectado)
        {
            wifiConectado = false;

            Serial.println();
            Serial.println(
                "Wi-Fi desconectado!");
        }

        // Tenta reconectar periodicamente
        if (
            millis() - ultimaTentativa >= INTERVALO_RECONEXAO)
        {
            ultimaTentativa =
                millis();

            Serial.println(
                "Tentando reconectar...");

            WiFi.reconnect();
        }
    }

    delay(100);
}
