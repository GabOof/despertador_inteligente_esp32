# Despertador Inteligente com Sensor de Movimento

Projeto desenvolvido na disciplina de **Tópicos Especiais em Robótica**, utilizando um **ESP32** integrado a Wi-Fi, MQTT, Gateway Node.js e Redis.

O sistema utiliza um sensor PIR para detectar movimento, LEDs para sinalização e um buzzer como alarme. O ESP32 publica telemetria via MQTT e recebe comandos remotos.

---

## Hardware

### Componentes

- ESP32 DevKit V1;
- sensor PIR HC-SR501;
- buzzer passivo;
- LED verde;
- LED vermelho;
- resistores;
- diodo;
- capacitor;
- protoboard;
- jumpers;
- cabo USB.

### Pinagem

| Componente   | GPIO |
| ------------ | ---: |
| PIR HC-SR501 |   27 |
| LED verde    |   25 |
| LED vermelho |   32 |
| Buzzer       |   12 |

---

# 1. Teste de Wi-Fi

O arquivo:

```text
wifi/wifi_connection.ino
```

é utilizado para testar:

- conexão do ESP32 ao Wi-Fi;
- endereço IP;
- gateway;
- RSSI;
- perda de conexão;
- reconexão automática.

Abra o arquivo na Arduino IDE e configure:

```cpp
const char* ssid = "SEU_WIFI";
const char* senha = "SUA_SENHA";
```

Selecione:

```text
Board: ESP32 Dev Module
Port: porta serial do ESP32
```

Faça o upload e abra o Monitor Serial em:

```text
115200 baud
```

Resultado esperado:

```text
Wi-Fi conectado!

IP: ...
Gateway: ...
RSSI: ... dBm
```

---

# 2. Executar o firmware MQTT

O firmware principal está em:

```text
mqtt/mqtt_connection.ino
```

Ele implementa:

- leitura do PIR;
- controle dos LEDs;
- buzzer;
- conexão Wi-Fi;
- HiveMQ Cloud;
- publicação de telemetria;
- recebimento de comandos;
- modo automático.

Configure suas credenciais de Wi-Fi e MQTT antes de fazer o upload.

Após o upload, abra o Monitor Serial:

```text
115200 baud
```

O ESP32 deverá informar:

```text
Wi-Fi conectado!
MQTT conectado!
Inscrito no topico de comandos.
```

---

## Tópicos MQTT

### Telemetria

```text
despertador/gab/esp32-01/telemetria
```

Exemplo:

```json
{
    "movimento": true,
    "ledVerde": true,
    "ledVermelho": false,
    "alarmeAtivo": false,
    "modoAutomatico": false,
    "pausaMovimento": false,
    "rssi": -55
}
```

### Comandos

```text
despertador/gab/esp32-01/comando
```

Ligar alarme:

```json
{ "comando": "ligar_alarme" }
```

Desligar alarme:

```json
{ "comando": "desligar_alarme" }
```

Ativar modo automático:

```json
{ "comando": "automatico" }
```

No modo automático, o buzzer toca até detectar movimento. Após a detecção, o buzzer é pausado temporariamente antes de voltar a tocar.

### Estado

```text
despertador/gab/esp32-01/estado
```

Exemplo:

```json
{
    "alarmeAtivo": false,
    "modoAutomatico": true,
    "pausaMovimento": true
}
```

---

# 3. Iniciar o Redis

O Redis é utilizado para armazenar:

- estado atual;
- histórico de telemetria;
- último contato;
- presença do dispositivo.

Para iniciar o container:

```bash
docker start redis-despertador
```

Caso ainda não exista:

```bash
docker run -d \
  --name redis-despertador \
  -p 6379:6379 \
  redis:7-alpine
```

Teste a conexão:

```bash
docker exec redis-despertador redis-cli PING
```

Resultado esperado:

```text
PONG
```

---

# 4. Executar o Gateway Node.js

Entre na pasta:

```bash
cd gateway
```

Instale as dependências:

```bash
npm install
```

O arquivo `.env` deve possuir:

```env
MQTT_HOST=SEU_BROKER
MQTT_PORT=8883

MQTT_USERNAME=SEU_USUARIO
MQTT_PASSWORD=SUA_SENHA

MQTT_CLIENT_ID=gateway-despertador-gab

REDIS_URL=redis://localhost:6379
```

Execute:

```bash
npm start
```

Resultado esperado:

```text
Redis conectado com sucesso!

GATEWAY MQTT CONECTADO!

Topicos assinados:
- despertador/gab/+/telemetria
- despertador/gab/+/estado

Aguardando mensagens...
```

Quando o ESP32 publicar uma telemetria:

```text
NOVA MENSAGEM MQTT

Dispositivo: esp32-01
Tipo: telemetria

MENSAGEM VALIDA
Mensagem persistida no Redis
```

---

# 5. Estrutura das chaves Redis

O dispositivo é identificado como:

```text
esp32-01
```

As principais chaves são:

```text
iot:device:esp32-01:state
iot:device:esp32-01:history
iot:device:esp32-01:lastSeen
iot:device:esp32-01:presence
```

Onde:

```text
state
→ estado atual

history
→ histórico de telemetria

lastSeen
→ último contato

presence
→ online/offline
```

---

# 6. Consultar os dados no Redis

Abra o Redis CLI:

```bash
docker exec -it redis-despertador redis-cli
```

Estado atual:

```redis
HGETALL iot:device:esp32-01:state
```

Histórico:

```redis
LRANGE iot:device:esp32-01:history 0 -1
```

Último contato:

```redis
GET iot:device:esp32-01:lastSeen
```

Presença:

```redis
GET iot:device:esp32-01:presence
```

---

## Consulta pelo Node.js

Também é possível consultar tudo utilizando:

```bash
cd gateway
npm run redis:query
```

O comando apresenta:

```text
ESTADO ATUAL
ULTIMO CONTATO
PRESENCA
HISTORICO
```

---

## Autor

**Gabrielle de Oliveira Fonseca**
**0072379**

Projeto acadêmico desenvolvido para a disciplina de **Tópicos Especiais em Robótica**.
