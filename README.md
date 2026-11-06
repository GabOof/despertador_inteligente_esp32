# Despertador Inteligente IoT

Projeto desenvolvido na disciplina de **Tópicos Especiais em Robótica**.

O sistema utiliza um **ESP32** com sensor PIR, LEDs e buzzer, integrado a uma arquitetura IoT com **Wi-Fi, MQTT, Node.js, Redis e interface web**.

O objetivo é permitir o monitoramento do dispositivo e o controle remoto do alarme.

---

# Hardware

| Componente          | GPIO |
| ------------------- | ---: |
| Sensor PIR HC-SR501 |   27 |
| LED verde           |   25 |
| LED vermelho        |   32 |
| Buzzer passivo      |   12 |

O protótipo também utiliza protoboard, resistores, jumpers, capacitor, diodo e cabo USB.

---

# 1. Firmware do ESP32

O firmware está em:

```text
firmware/despertador.ino
```

Ele é responsável por:

- conexão Wi-Fi;
- conexão MQTT;
- leitura do sensor PIR;
- controle dos LEDs;
- controle do buzzer;
- envio de telemetria;
- recebimento de comandos;
- confirmação dos comandos;
- modo automático.

---

## Configurar credenciais

Crie:

```text
firmware/secrets.h
```

---

## Enviar firmware

Na Arduino IDE:

```text
Board: ESP32 Dev Module
Serial: 115200 baud
```

Faça o upload de:

```text
firmware/despertador.ino
```

Resultado esperado:

```text
Despertador iniciado
[OK] MQTT conectado
```

---

# 2. MQTT

O dispositivo utilizado no projeto é:

```text
esp32-01
```

---

# 3. Redis

O Redis armazena:

- última telemetria;
- histórico;
- estado confirmado;
- último contato;
- presença;
- situação dos comandos.

Para iniciar:

```bash
docker compose up -d
```

---

# 4. Backend Node.js

O backend está em:

```text
backend/server.js
```

Ele reúne:

- Gateway MQTT;
- integração com Redis;
- API REST;
- envio de comandos;
- recebimento das confirmações do ESP32;
- disponibilização do sistema web.

---

## Configurar `.env`

Crie:

```text
backend/.env
```

---

## Instalar dependências

```bash
cd backend
npm install
```

---

## Executar

```bash
npm start
```

---

# 5. Sistema Web

O frontend está em:

```text
backend/public/index.html
```

Para acessar:

```text
http://localhost:3000
```

A interface apresenta:

- presença do dispositivo;
- último contato;
- estado do sensor PIR;
- estado do alarme;
- sinal Wi-Fi;
- histórico de telemetria;
- botão para ligar o alarme;
- botão para desligar o alarme;
- botão para ativar o modo automático.

A página é atualizada automaticamente a partir dos dados armazenados no Redis.

---

# 6. Como executar o projeto completo

Primeiro:

```bash
docker compose up -d
```

Depois conecte o ESP32 com o firmware carregado.

Em seguida:

```bash
cd backend
npm start
```

Por fim, abra:

```text
http://localhost:3000
```

---

# Autor

**Gabrielle de Oliveira Fonseca**

**0072379**

Projeto acadêmico desenvolvido para a disciplina de **Tópicos Especiais em Robótica**.
