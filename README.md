# Despesas Mobile

Aplicativo Expo/React Native para autenticação na API e gerenciamento de despesas.

## Requisitos

- Node.js 20.19.4 ou superior.
- Android Studio e SDK Android para executar localmente no Android.
- Um emulador Android ou dispositivo físico conectado.
- A API Despesas acessível pela rede.

## Configuração

Instale as dependências na pasta `Frontend`:

```powershell
npm install
```

Copie `.env.example` para `.env` e configure `EXPO_PUBLIC_API_URL`:

- Emulador Android: `http://10.0.2.2:5164`.
- Emulador iOS: `http://127.0.0.1:5164`.
- Aparelho físico: use o IP da máquina que executa a API, por exemplo `http://192.168.0.20:5164`.

Para acessar a API por um aparelho físico, execute-a escutando na rede local, por exemplo:

```powershell
cd ..\Api
dotnet run --urls http://0.0.0.0:5164
```

Libere a porta no firewall do Windows, se necessário. O tráfego HTTP está liberado somente para facilitar o desenvolvimento local. Use HTTPS em produção.

## Executar

O reconhecimento de texto usa Google ML Kit nativo; por isso, Expo Go não é suficiente. Gere e execute um development build Android:

```powershell
npx expo run:android
```

Para iniciar o Metro depois que o development build estiver instalado:

```powershell
npm start
```

Para validar os tipos:

```powershell
npm run typecheck
```

## Fluxos implementados

- Login em `POST /login`; o JWT fica no armazenamento seguro do aparelho.
- Home e dashboard calculados a partir de `GET /despesas`.
- Criar, consultar, atualizar, alterar categoria e excluir despesas por meio de `POST`, `GET`, `PUT`, `PATCH` e `DELETE /despesas`.
- Captura do comprovante e OCR local para sugerir descrição, data, valor, pagamento e categoria. Os campos podem ser revisados antes de salvar.

A API atual não oferece upload nem armazenamento de imagens; o comprovante fotografado é usado para leitura no aparelho e não é enviado ao servidor. A leitura de categoria e pagamento usa heurísticas e precisa de revisão do usuário.