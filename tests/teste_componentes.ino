const int ledVermelho = 32;
const int ledVerde = 25;

void setup()
{
    pinMode(ledVermelho, OUTPUT);
    pinMode(ledVerde, OUTPUT);
}

void loop()
{
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde, HIGH);
}
