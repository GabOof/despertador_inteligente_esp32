# Despertador Inteligente com Sensor de Movimento

Projeto desenvolvido na disciplina de **Tópicos Especiais em Robótica**, utilizando o microcontrolador **ESP32**.

O projeto consiste em um despertador inteligente integrado a uma arquitetura IoT. O ESP32 utiliza um sensor PIR para detectar movimento, LEDs para sinalização visual e um buzzer como atuador sonoro.

Além do funcionamento local, o dispositivo se conecta a uma rede Wi-Fi e a um broker MQTT, permitindo o envio de telemetria e o recebimento de comandos remotamente.

O projeto está sendo desenvolvido de forma incremental, acompanhando as etapas da disciplina.

---

# Hardware

## Componentes

O protótipo utiliza:

- 1 ESP32 DevKit V1;
- 1 protoboard;
- 1 sensor PIR HC-SR501;
- 1 buzzer passivo;
- 1 capacitor de 100 nF (para o buzzer);
- 1 diodo 1N4007 (para o buzzer);
- 1 LED verde;
- 1 LED vermelho;
- 2 resistores para os LEDs;
- jumpers;
- cabo USB;
- fonte USB de 5 V.

---

## Pinagem atual

| Componente          |    GPIO |
| ------------------- | ------: |
| Sensor PIR HC-SR501 | GPIO 27 |
| LED verde           | GPIO 25 |
| LED vermelho        | GPIO 32 |
| Buzzer              | GPIO 12 |

---

### Comando

```text
despertador/gab/esp32-01/comando
```

Direção:

```text
Broker MQTT → ESP32
```

Permite controlar o dispositivo remotamente.

Comandos atualmente implementados:

```json
{
    "comando": "ligar_alarme"
}
```

```json
{
    "comando": "desligar_alarme"
}
```

```json
{
    "comando": "automatico"
}
```

---

### Estado

```text
despertador/gab/esp32-01/estado
```

Direção:

```text
ESP32 → Broker MQTT
```

Utilizado para confirmar o estado do sistema após a execução de comandos.

Exemplo:

```json
{
    "alarmeAtivo": false,
    "modoAutomatico": true,
    "pausaMovimento": true
}
```

---

## Autor

**Gabrielle de Oliveira Fonseca**
**0072379**

Projeto acadêmico desenvolvido para a disciplina de **Tópicos Especiais em Robótica**.
