#include <WiFi.h>

const char *ssid = "WIFI_AQUI";
const char *senha = "SENHA_AQUI";

unsigned long ultimaTentativa = 0;
bool wifiConectado = false;

void setup()
{
    Serial.begin(115200);

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, senha);

    Serial.println("Conectando ao Wi-Fi...");
}

void loop()
{
    // Se estiver conectado
    if (WiFi.status() == WL_CONNECTED)
    {
        if (!wifiConectado)
        {
            wifiConectado = true;

            Serial.println();
            Serial.println("Wi-Fi conectado!");

            Serial.print("IP: ");
            Serial.println(WiFi.localIP());

            Serial.print("Gateway: ");
            Serial.println(WiFi.gatewayIP());

            Serial.print("RSSI: ");
            Serial.print(WiFi.RSSI());
            Serial.println(" dBm");
        }
    }

    // Se estiver desconectado
    else
    {
        if (wifiConectado)
        {
            Serial.println();
            Serial.println("Wi-Fi desconectado!");

            wifiConectado = false;
        }

        // Tenta reconectar a cada 5 segundos
        if (millis() - ultimaTentativa >= 5000)
        {
            ultimaTentativa = millis();

            Serial.println("Tentando reconectar...");
            WiFi.reconnect();
        }
    }

    delay(100);
}
