# Fluxo de dados do sistema

## Fluxo principal

### 1. Coleta de dados e eventos locais

- O **sensor PIR HC-SR501** envia um **sinal** ao ESP32 quando detecta movimento.
- O **botão físico** envia um **evento** ao ESP32 quando pressionado.

### 2. Processamento local

- O **ESP32** recebe os dados do sensor e do botão.
- O ESP32 verifica a lógica do despertador:
    - horário configurado;
    - detecção ou ausência de movimento;
    - necessidade de disparo do alarme.

### 3. Ação sobre os atuadores

- O ESP32 **aciona os LEDs e o buzzer** quando a condição de alarme é satisfeita.

### 4. Publicação dos dados

- O ESP32 **publica** informações do sistema.
- Essas informações passam pelo **roteador Wi‑Fi**.
- O roteador **encaminha** os dados ao **broker MQTT**.

### 5. Entrega ao gateway

- O **broker MQTT** **entrega** as mensagens ao **Gateway/Node.js**.

### 6. Persistência e consulta

- O **Gateway/Node.js** **armazena/consulta** dados no **Redis**.
- O Redis mantém:
    - estado atual;
    - histórico de eventos;
    - informações de presença;
    - registros do alarme.

### 7. Atualização da interface

- O **Gateway/Node.js** **atualiza** o **painel web** com os dados mais recentes.

---

## Fluxo de controle remoto

### 1. Comando do usuário

- O usuário interage com o **painel web**.
- O painel envia um **comando** ao **Gateway/Node.js**.

### 2. Publicação do comando

- O **Gateway/Node.js** **publica** esse comando no **broker MQTT**.

### 3. Entrega ao ESP32

- O **broker MQTT** entrega a mensagem ao lado do dispositivo.
- O **roteador Wi‑Fi** participa do transporte dessa comunicação.
- O **ESP32 recebe** o comando.

### 4. Execução local

- O ESP32 executa a ação solicitada, por exemplo:
    - ativar o alarme;
    - desativar o alarme;
    - testar buzzer;
    - alterar configuração.

### 5. Retorno do estado

- O ESP32 publica novamente seu novo estado.
- O fluxo percorre:
  **ESP32 → Roteador Wi‑Fi → Broker MQTT → Gateway/Node.js**
- O gateway processa e **atualiza o painel web**.
