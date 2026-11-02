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

Copie `.env.example` para `.env`. Por padrão, o app acessa `http://despesas.runasp.net`.
Para apontar para outro servidor, altere `EXPO_PUBLIC_API_URL` no `.env`:

- Emulador Android: `http://10.0.2.2:5164`.
- Emulador iOS: `http://127.0.0.1:5164`.
- Aparelho físico na rede local: use o IP da máquina que executa a API, por exemplo `http://192.168.0.20:5164`.

O endereço também pode ser definido diretamente no módulo [src/config.ts](./src/config.ts). Ao alterar a URL no `.env`, reinicie o Expo para que a configuração seja aplicada.
No aplicativo, edite o endereço em **Opções > Conexão**; a configuração fica salva no aparelho e também pode ser acessada na tela de login. Ao trocar a API durante uma sessão, será necessário entrar novamente.

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
- Atualização de dashboard e despesas ao arrastar a tela para baixo.
- Criar, consultar, atualizar, alterar categoria e excluir despesas por meio de `POST`, `GET`, `PUT`, `PATCH` e `DELETE /despesas`.
- Captura do comprovante e OCR local para sugerir descrição, data, valor, pagamento e categoria. Os campos podem ser revisados antes de salvar.

A API atual não oferece upload nem armazenamento de imagens; o comprovante fotografado é usado para leitura no aparelho e não é enviado ao servidor. A leitura de categoria e pagamento usa heurísticas e precisa de revisão do usuário.