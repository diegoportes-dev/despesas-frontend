const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:5164';
const isHttpApi = apiUrl.startsWith('http://');

module.exports = {
  expo: {
    name: 'Despesas',
    slug: 'despesas-mobile',
    scheme: 'despesas',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    ios: {
      bundleIdentifier: 'com.diegoportes.despesasmobile',
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: 'A câmera é usada para ler comprovantes de despesas.',
        NSLocalNetworkUsageDescription: 'A conexão local é usada para acessar a API durante o desenvolvimento.',
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: isHttpApi
        }
      },
    },
    android: {
      package: 'com.diegoportes.desposasmobile',
      permissions: ['CAMERA'],
      adaptiveIcon: {
        backgroundColor: '#F4F1E8',
      },
    },
    plugins: [
      ['expo-build-properties', { android: { usesCleartextTraffic: isHttpApi } }],
      ['expo-camera', { cameraPermission: 'Permita o acesso à câmera para fotografar comprovantes.', recordAudioAndroid: false }],
      ['expo-secure-store', { faceIDPermission: 'Permita o acesso seguro à sua sessão.' }],
    ],
    // Adicionado para o EAS vincular o projeto na nuvem
    extra: {
      eas: {
        projectId: "45f8a2c5-8e3e-4704-88b8-c6a0d9060e30"
      }
    }
  }
};
