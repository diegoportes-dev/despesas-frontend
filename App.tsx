import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Feather } from '@expo/vector-icons';
import type { CameraCapturedPicture } from 'expo-camera';
import {
  ApiError,
  clearSavedToken,
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  patchExpense,
  readSavedToken,
  shouldSignOut,
  signIn,
  updateExpense,
} from './src/api';
import { formatLocalDate, readReceipt } from './src/receiptOcr';
import type { Expense, ExpenseDraft, ExpenseInput } from './src/types';

type MainTab = 'dashboard' | 'camera' | 'expenses' | 'options';
type CategoryName = 'Alimentação' | 'Transporte' | 'Moradia' | 'Saúde' | 'Lazer' | 'Outros';

const C = {
  paper: '#F4F1E8',
  white: '#FFFEFA',
  ink: '#153B35',
  forest: '#19463E',
  muted: '#64766E',
  line: '#DCE0D5',
  mint: '#D9E8DB',
  mintDark: '#BBD6C0',
  coral: '#DE654C',
  coralLight: '#F5DDD4',
  gold: '#EBCB70',
  blue: '#A8C7D0',
  error: '#A83E31',
};

const categoryColors: Record<string, string> = {
  Alimentação: C.coral,
  Transporte: '#6997A3',
  Moradia: '#D2A845',
  Saúde: '#7B9A74',
  Lazer: '#A87970',
  Outros: '#849087',
};

const categories: CategoryName[] = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros'];
const paymentMethods = ['PIX', 'Cartão de débito', 'Cartão de crédito', 'Dinheiro', 'Transferência', 'Outro'];

function newDraft(): ExpenseDraft {
  return {
    dataDespesa: formatLocalDate(new Date()),
    descricaoDespesa: '',
    valorDespesa: '',
    modalidadePagamento: '',
    categoriaDespesa: '',
  };
}

function parseLocalDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const date = new Date(+match[3], +match[2] - 1, +match[1], +match[4], +match[5], +match[6]);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayDate(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function draftFromExpense(expense: Expense): ExpenseDraft {
  const parsed = parseLocalDate(expense.dataDespesa);
  return {
    dataDespesa: parsed ? formatLocalDate(parsed) : expense.dataDespesa,
    descricaoDespesa: expense.descricaoDespesa,
    valorDespesa: expense.valorDespesa.toFixed(2).replace('.', ','),
    modalidadePagamento: expense.modalidadePagamento,
    categoriaDespesa: expense.categoriaDespesa,
  };
}

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [token, setToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<MainTab>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState<ExpenseDraft>(newDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const cameraReturnScreen = useRef<MainTab>('dashboard');
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    readSavedToken()
      .then(setToken)
      .catch(() => setToken(null))
      .finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    if (!token) {
      setExpenses([]);
      return;
    }
    void refreshExpenses(token);
  }, [token]);

  async function refreshExpenses(activeToken = token) {
    if (!activeToken) return;
    setListError('');
    try {
      const result = await listExpenses(activeToken);
      setExpenses(result.data ?? []);
    } catch (error) {
      if (shouldSignOut(error)) await signOut();
      else setListError(error instanceof Error ? error.message : 'Não foi possível carregar as despesas.');
    }
  }

  async function signOut() {
    await clearSavedToken().catch(() => undefined);
    setToken(null);
    setPassword('');
    setScreen('dashboard');
  }

  async function handleLogin() {
    setLoginError('');
    if (!email.trim() || !password) {
      setLoginError('Informe seu e-mail e sua senha.');
      return;
    }
    setLoading(true);
    try {
      const savedToken = await signIn(email.trim(), password);
      setToken(savedToken);
      setPassword('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  function openNewExpense(initialDraft = newDraft(), imageUri: string | null = null) {
    setDraft(initialDraft);
    setReceiptUri(imageUri);
    setEditingId(null);
    setFormError('');
    setFormOpen(true);
    setScreen('expenses');
  }

  function closeCamera() {
    setCameraOpen(false);
    setScreen(cameraReturnScreen.current);
  }

  function openEdit(expense: Expense) {
    setDraft(draftFromExpense(expense));
    setReceiptUri(null);
    setEditingId(expense.id);
    setFormError('');
    setSelectedExpense(null);
    setFormOpen(true);
  }

  async function openDetails(expense: Expense) {
    if (!token) return;
    setLoading(true);
    try {
      const result = await getExpense(token, expense.id);
      setSelectedExpense(result.data);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Não foi possível abrir a despesa.');
    } finally {
      setLoading(false);
    }
  }

  async function saveExpense() {
    if (!token) return;
    setFormError('');
    if (!parseLocalDate(draft.dataDespesa)) {
      setFormError('Use a data no formato DD/MM/AAAA HH:MM:SS.');
      return;
    }
    if (!draft.descricaoDespesa.trim()) {
      setFormError('Informe uma descrição para a despesa.');
      return;
    }
    const amount = parseMoney(draft.valorDespesa);
    if (amount === null) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    if (!draft.modalidadePagamento || !draft.categoriaDespesa) {
      setFormError('Escolha a modalidade de pagamento e a categoria.');
      return;
    }

    const input: ExpenseInput = {
      dataDespesa: draft.dataDespesa,
      descricaoDespesa: draft.descricaoDespesa.trim(),
      valorDespesa: amount,
      modalidadePagamento: draft.modalidadePagamento,
      categoriaDespesa: draft.categoriaDespesa,
    };

    setLoading(true);
    try {
      if (editingId) await updateExpense(token, editingId, input);
      else await createExpense(token, input);
      setFormOpen(false);
      setReceiptUri(null);
      await refreshExpenses(token);
    } catch (error) {
      if (shouldSignOut(error)) await signOut();
      else setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a despesa.');
    } finally {
      setLoading(false);
    }
  }

  async function changeCategory(expense: Expense, category: string) {
    if (!token || expense.categoriaDespesa === category) return;
    setLoading(true);
    try {
      const result = await patchExpense(token, expense.id, { categoriaDespesa: category });
      setSelectedExpense(result.data);
      await refreshExpenses(token);
    } catch (error) {
      Alert.alert('Não foi possível atualizar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function confirmDelete(expense: Expense) {
    Alert.alert('Excluir despesa?', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => void removeExpense(expense),
      },
    ]);
  }

  async function removeExpense(expense: Expense) {
    if (!token) return;
    setLoading(true);
    try {
      await deleteExpense(token, expense.id);
      setSelectedExpense(null);
      await refreshExpenses(token);
    } catch (error) {
      Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function startCamera() {
    cameraReturnScreen.current = screen === 'camera' ? 'dashboard' : screen;
    setScreen('camera');
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setScreen(cameraReturnScreen.current);
        Alert.alert('Acesso à câmera', 'Ative a permissão de câmera nas configurações para fotografar um comprovante.');
        return;
      }
    }
    setCameraOpen(true);
  }

async function captureReceipt() {
  if (!cameraRef.current) return;
  setScanBusy(true);
  try {
    // 1. Tira a foto usando a câmera nativa do aparelho
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.80 });
    if (!photo?.uri) throw new Error('A foto não foi capturada.');
    
    setCameraOpen(false);

    // 2. Prepara a imagem para ser enviada via HTTP para o seu backend
    const formData = new FormData();
    formData.append('receipt', {
      uri: Platform.OS === 'ios' ? photo.uri.replace('file://', '') : photo.uri,
      type: 'image/jpeg',
      name: 'receipt.jpg',
    } as any);

    // 3. Envia para o endpoint da sua API que processa a IA (ex: /despesas/analisar-comprovante)
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/despesas/analisar-comprovante`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`, // Se a sua API exigir o token de login
      },
    });

    if (!response.ok) throw new Error('Falha na análise da IA do servidor.');

    const result = await response.json();
    
    // 4. Abre o formulário do app com os dados que a IA na nuvem descobriu
    openNewExpense(result.draft, photo.uri);

  } catch (error) {
    setCameraOpen(false);
    setScreen(cameraReturnScreen.current);
    Alert.alert('Erro no processamento', error instanceof Error ? error.message : 'Tente fotografar novamente.');
  } finally {
    setScanBusy(false);
  }
}


  if (!fontsLoaded || !sessionReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={C.coral} size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <LoginScreen
        email={email}
        password={password}
        error={loginError}
        loading={loading}
        onEmail={setEmail}
        onPassword={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  const now = new Date();
  const currentMonthExpenses = expenses.filter(expense => {
    const date = parseLocalDate(expense.dataDespesa);
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const totalMonth = currentMonthExpenses.reduce((sum, expense) => sum + expense.valorDespesa, 0);
  const categoryTotals = [...currentMonthExpenses.reduce((totals, expense) => {
    const category = expense.categoriaDespesa || 'Outros';
    totals.set(category, (totals.get(category) ?? 0) + expense.valorDespesa);
    return totals;
  }, new Map<string, number>())]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const categoryOptions = [...new Set([...categories, ...expenses.map(expense => expense.categoriaDespesa)])];
  const filteredExpenses = expenses.filter(expense =>
    `${expense.descricaoDespesa} ${expense.categoriaDespesa} ${expense.modalidadePagamento}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <View style={styles.appRoot}>
      <ExpoStatusBar style="light" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brandEyebrow}>CONTROLE PESSOAL</Text>
          <Text style={styles.brandTitle}>despesas<Text style={styles.brandDot}>.</Text></Text>
        </View>
        <View style={styles.headerMark}><Feather name="bar-chart-2" size={18} color={C.gold} /></View>
      </View>

      <View style={styles.contentWrap}>
        {screen === 'dashboard' && (
          <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
            <View style={styles.headingLine}>
              <View>
                <Text style={styles.kicker}>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</Text>
                <Text style={styles.pageTitle}>Dashboard</Text>
              </View>
              <View style={styles.avatar}><Feather name="pie-chart" size={19} color={C.ink} /></View>
            </View>

            <View style={styles.balancePanel}>
              <View style={styles.balanceTopline}>
                <Text style={styles.balanceLabel}>TOTAL DO MÊS</Text>
                <Feather name="arrow-up-right" size={17} color={C.gold} />
              </View>
              <Text style={styles.balanceValue}>{money(totalMonth)}</Text>
              <Text style={styles.balanceCaption}>{monthLabel(now)} · {currentMonthExpenses.length} lançamento{currentMonthExpenses.length === 1 ? '' : 's'}</Text>
              <View style={styles.balanceBottom}>
                <View style={styles.balanceMeter}><View style={[styles.balanceMeterFill, { width: `${Math.min(100, totalMonth / 3000 * 100)}%` }]} /></View>
                <Text style={styles.balanceGoal}>meta R$ 3 mil</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Acesso rápido</Text>
              <Pressable onPress={() => setScreen('expenses')}><Text style={styles.textLink}>Ver despesas</Text></Pressable>
            </View>
            <View style={styles.quickActions}>
              <Pressable style={[styles.quickAction, styles.quickActionPrimary]} onPress={() => openNewExpense()}>
                <View style={styles.quickIconPrimary}><Feather name="plus" size={19} color={C.white} /></View>
                <Text style={styles.quickActionTitle}>Nova despesa</Text>
                <Text style={styles.quickActionSub}>Adicionar lançamento</Text>
              </Pressable>
              <Pressable style={[styles.quickAction, styles.quickActionPhoto]} onPress={() => void startCamera()}>
                <View style={styles.quickIconPhoto}><Feather name="camera" size={18} color={C.ink} /></View>
                <Text style={styles.quickActionTitle}>Ler comprovante</Text>
                <Text style={styles.quickActionSub}>Foto com preenchimento</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Por categoria</Text>
              <Feather name="bar-chart-2" size={18} color={C.ink} />
            </View>
            {categoryTotals.length ? categoryTotals.map(item => (
              <View style={styles.categoryRow} key={item.category}>
                <View style={styles.categoryRowHead}>
                  <View style={[styles.categoryBullet, { backgroundColor: categoryColors[item.category] ?? C.muted }]} />
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryAmount}>{money(item.amount)}</Text>
                </View>
                <View style={styles.categoryTrack}>
                  <View style={[styles.categoryFill, {
                    width: `${Math.max(3, item.amount / Math.max(...categoryTotals.map(entry => entry.amount)) * 100)}%`,
                    backgroundColor: categoryColors[item.category] ?? C.muted,
                  }]} />
                </View>
              </View>
            )) : <EmptyState title="Sem dados neste mês" body="As categorias aparecem aqui conforme você registra despesas." />}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recentes</Text>
              <Pressable onPress={() => setScreen('expenses')}><Text style={styles.textLink}>Ver todas</Text></Pressable>
            </View>
            {listError ? <InlineError message={listError} onRetry={() => void refreshExpenses()} /> : null}
            {expenses.slice(0, 4).map(expense => (
              <ExpenseRow key={expense.id} expense={expense} onPress={() => void openDetails(expense)} />
            ))}
            {!expenses.length && !listError && <EmptyState title="Tudo em dia" body="Registre uma despesa ou fotografe um comprovante para começar." />}
          </ScrollView>
        )}

        {screen === 'expenses' && (
          <View style={styles.expensesPage}>
            <View style={styles.expenseHeading}>
              <View><Text style={styles.kicker}>{expenses.length} lançamento{expenses.length === 1 ? '' : 's'}</Text><Text style={styles.pageTitle}>Despesas</Text></View>
              <Pressable accessibilityLabel="Nova despesa" style={styles.addButton} onPress={() => openNewExpense()}>
                <Feather name="plus" size={22} color={C.white} />
              </Pressable>
            </View>
            <View style={styles.searchBox}>
              <Feather name="search" size={17} color={C.muted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por descrição ou categoria" placeholderTextColor="#8D9A92" style={styles.searchInput} returnKeyType="search" />
              {query ? <Pressable onPress={() => setQuery('')} accessibilityLabel="Limpar busca"><Feather name="x" size={16} color={C.muted} /></Pressable> : null}
            </View>
            {listError ? <InlineError message={listError} onRetry={() => void refreshExpenses()} /> : null}
            <ScrollView contentContainerStyle={styles.expenseList} showsVerticalScrollIndicator={false}>
              {filteredExpenses.map(expense => <ExpenseRow key={expense.id} expense={expense} onPress={() => void openDetails(expense)} />)}
              {!filteredExpenses.length && !listError && <EmptyState title={query ? 'Nada encontrado' : 'Sem despesas ainda'} body={query ? 'Tente outra busca.' : 'Toque no botão + para adicionar seu primeiro lançamento.'} />}
            </ScrollView>
          </View>
        )}

        {screen === 'options' && (
          <ScrollView contentContainerStyle={styles.pageContent}>
            <Text style={styles.kicker}>PREFERÊNCIAS DA CONTA</Text>
            <Text style={styles.pageTitle}>Opções</Text>
            <View style={styles.accountPanel}>
              <View style={styles.accountGlyph}><Feather name="user" size={20} color={C.ink} /></View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountLabel}>SESSÃO ATIVA</Text>
                <Text numberOfLines={1} style={styles.accountEmail}>{email}</Text>
              </View>
            </View>
            <Pressable style={styles.logoutRow} onPress={() => void signOut()}>
              <View style={styles.logoutGlyph}><Feather name="log-out" size={17} color={C.error} /></View>
              <Text style={styles.logoutText}>Sair da conta</Text>
              <Feather name="chevron-right" size={17} color={C.muted} />
            </Pressable>
          </ScrollView>
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton label="Dashboard" icon="bar-chart-2" active={screen === 'dashboard'} onPress={() => setScreen('dashboard')} />
        <TabButton label="Câmera de foto" icon="camera" active={screen === 'camera'} onPress={() => void startCamera()} />
        <TabButton label="Despesas" icon="file-text" active={screen === 'expenses'} onPress={() => setScreen('expenses')} />
        <TabButton label="Opções" icon="settings" active={screen === 'options'} onPress={() => setScreen('options')} />
      </View>

      <ExpenseFormModal
        visible={formOpen}
        draft={draft}
        error={formError}
        busy={loading}
        editing={Boolean(editingId)}
        imageUri={receiptUri}
        onClose={() => { setFormOpen(false); setReceiptUri(null); }}
        onChange={setDraft}
        onSave={() => void saveExpense()}
      />

      <ExpenseDetailsModal
        expense={selectedExpense}
        busy={loading}
        onClose={() => setSelectedExpense(null)}
        onEdit={openEdit}
        onDelete={confirmDelete}
        onChangeCategory={changeCategory}
        categories={categoryOptions}
      />

      <Modal visible={cameraOpen} animationType="slide" onRequestClose={closeCamera}>
        <View style={styles.cameraScreen}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.cameraHeader}>
            <Pressable accessibilityLabel="Fechar câmera" style={styles.cameraClose} onPress={closeCamera}><Feather name="x" size={22} color={C.white} /></Pressable>
            <View style={styles.cameraTitleWrap}><Text style={styles.cameraTitle}>Comprovante</Text><Text style={styles.cameraSub}>Enquadre o recibo e capture</Text></View>
            <View style={styles.cameraSpacer} />
          </View>
          <View pointerEvents="none" style={styles.scanFrame}><View style={styles.scanCornerTL} /><View style={styles.scanCornerTR} /><View style={styles.scanCornerBL} /><View style={styles.scanCornerBR} /></View>
          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>A imagem será analisada no aparelho</Text>
            <Pressable accessibilityLabel="Fotografar comprovante" style={styles.shutterOuter} onPress={() => void captureReceipt()} disabled={scanBusy}>
              {scanBusy ? <ActivityIndicator color={C.ink} /> : <View style={styles.shutterInner} />}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LoginScreen(props: {
  email: string;
  password: string;
  error: string;
  loading: boolean;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <KeyboardAvoidingView style={styles.loginRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ExpoStatusBar style="light" />
      <View style={styles.loginHero}>
        <View style={styles.loginMark}><Feather name="activity" size={22} color={C.ink} /></View>
        <Text style={styles.loginOverline}>CONTROLE PESSOAL</Text>
        <Text style={styles.loginBrand}>despesas<Text style={{ color: C.gold }}>.</Text></Text>
        <View style={styles.loginAccentLine} />
        <Text style={styles.loginDate}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</Text>
        <View style={styles.loginOrbitOne} /><View style={styles.loginOrbitTwo} />
      </View>
      <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.loginHeading}>Entre na sua conta</Text>
        <Text style={styles.loginSubheading}>Suas despesas, em ordem.</Text>
        <Text style={styles.inputLabel}>E-MAIL</Text>
        <View style={styles.loginInputWrap}><Feather name="mail" size={17} color={C.muted} /><TextInput value={props.email} onChangeText={props.onEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="voce@exemplo.com" placeholderTextColor="#8D9A92" style={styles.loginInput} returnKeyType="next" accessibilityLabel="E-mail" /></View>
        <Text style={styles.inputLabel}>SENHA</Text>
        <View style={styles.loginInputWrap}><Feather name="lock" size={17} color={C.muted} /><TextInput value={props.password} onChangeText={props.onPassword} secureTextEntry placeholder="Sua senha" placeholderTextColor="#8D9A92" style={styles.loginInput} onSubmitEditing={props.onSubmit} returnKeyType="go" accessibilityLabel="Senha" /></View>
        {props.error ? <Text accessibilityRole="alert" style={styles.formError}>{props.error}</Text> : null}
        <Pressable disabled={props.loading} style={[styles.loginButton, props.loading && styles.disabledButton]} onPress={props.onSubmit}>
          {props.loading ? <ActivityIndicator color={C.white} /> : <><Text style={styles.loginButtonText}>Entrar</Text><Feather name="arrow-right" size={18} color={C.white} /></>}
        </Pressable>
        <Text style={styles.loginFoot}>Acesso protegido pela API de despesas</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TabButton(props: { label: string; icon: keyof typeof Feather.glyphMap; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: props.active }} style={styles.tabButton} onPress={props.onPress}>
      <Feather name={props.icon} size={21} color={props.active ? C.coral : C.muted} />
      <Text style={[styles.tabLabel, props.active && styles.activeTabLabel]}>{props.label}</Text>
    </Pressable>
  );
}

function ExpenseRow(props: { expense: Expense; onPress: () => void }) {
  const color = categoryColors[props.expense.categoriaDespesa] ?? C.muted;
  return (
    <Pressable accessibilityRole="button" style={styles.expenseRow} onPress={props.onPress}>
      <View style={[styles.expenseGlyph, { backgroundColor: `${color}20` }]}><Feather name="file-text" size={17} color={color} /></View>
      <View style={styles.expenseInfo}>
        <Text numberOfLines={1} style={styles.expenseTitle}>{props.expense.descricaoDespesa}</Text>
        <Text numberOfLines={1} style={styles.expenseMeta}>{props.expense.categoriaDespesa} · {displayDate(props.expense.dataDespesa)}</Text>
      </View>
      <View style={styles.expenseValueCol}>
        <Text style={styles.expenseValue}>{money(props.expense.valorDespesa)}</Text>
        <Feather name="chevron-right" size={14} color="#98A39A" />
      </View>
    </Pressable>
  );
}

function EmptyState(props: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyMark}><Feather name="inbox" size={21} color={C.ink} /></View>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyBody}>{props.body}</Text>
    </View>
  );
}

function InlineError(props: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>{props.message}</Text>
      <Pressable onPress={props.onRetry}><Text style={styles.inlineRetry}>Tentar novamente</Text></Pressable>
    </View>
  );
}

function ExpenseFormModal(props: {
  visible: boolean;
  draft: ExpenseDraft;
  error: string;
  busy: boolean;
  editing: boolean;
  imageUri: string | null;
  onClose: () => void;
  onChange: (draft: ExpenseDraft) => void;
  onSave: () => void;
}) {
  function update<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    props.onChange({ ...props.draft, [key]: value });
  }

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ExpoStatusBar style="dark" />
        <View style={styles.modalHeader}>
          <Pressable accessibilityLabel="Voltar" style={styles.backButton} onPress={props.onClose}><Feather name="arrow-left" size={20} color={C.ink} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalKicker}>{props.editing ? 'ATUALIZAÇÃO' : 'NOVO LANÇAMENTO'}</Text><Text style={styles.modalTitle}>{props.editing ? 'Editar despesa' : 'Adicionar despesa'}</Text></View>
          <View style={{ width: 42 }} />
        </View>
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {props.imageUri ? <View style={styles.receiptPreview}><Image source={{ uri: props.imageUri }} style={styles.receiptImage} /><View style={styles.receiptOverlay}><Feather name="check-circle" size={16} color={C.white} /><Text style={styles.receiptOverlayText}>Leitura sugerida</Text></View></View> : null}
          <Text style={styles.formIntro}>{props.editing ? 'Atualize os dados do lançamento.' : 'Revise os dados antes de salvar.'}</Text>
          <FormField label="DATA E HORA" value={props.draft.dataDespesa} onChangeText={value => update('dataDespesa', value)} placeholder="24/10/2026 12:34:23" keyboardType="numbers-and-punctuation" />
          <FormField label="DESCRIÇÃO" value={props.draft.descricaoDespesa} onChangeText={value => update('descricaoDespesa', value)} placeholder="Ex.: Mercado da semana" />
          <FormField label="VALOR" value={props.draft.valorDespesa} onChangeText={value => update('valorDespesa', value.replace(/[^\d,.]/g, ''))} placeholder="0,00" keyboardType="decimal-pad" prefix="R$" />
          <FormField label="PAGAMENTO" value={props.draft.modalidadePagamento} onChangeText={value => update('modalidadePagamento', value)} placeholder="Ex.: PIX, cartão ou transferência" maxLength={100} />
          <View style={styles.optionWrap}>
            {paymentMethods.map(method => <OptionChip key={method} label={method} active={props.draft.modalidadePagamento === method} onPress={() => update('modalidadePagamento', method)} />)}
          </View>
          <FormField label="CATEGORIA" value={props.draft.categoriaDespesa} onChangeText={value => update('categoriaDespesa', value)} placeholder="Ex.: Alimentação" maxLength={100} />
          <View style={styles.optionWrap}>
            {categories.map(category => <OptionChip key={category} label={category} active={props.draft.categoriaDespesa === category} onPress={() => update('categoriaDespesa', category)} />)}
          </View>
          {props.error ? <Text accessibilityRole="alert" style={styles.formError}>{props.error}</Text> : null}
          <Pressable disabled={props.busy} style={[styles.saveButton, props.busy && styles.disabledButton]} onPress={props.onSave}>
            {props.busy ? <ActivityIndicator color={C.white} /> : <><Feather name="check" size={18} color={C.white} /><Text style={styles.saveButtonText}>{props.editing ? 'Salvar alterações' : 'Salvar despesa'}</Text></>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numbers-and-punctuation' | 'decimal-pad';
  prefix?: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <View style={styles.fieldBox}>
        {props.prefix ? <Text style={styles.fieldPrefix}>{props.prefix}</Text> : null}
        <TextInput value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} placeholderTextColor="#8D9A92" keyboardType={props.keyboardType ?? 'default'} maxLength={props.maxLength} style={styles.fieldInput} />
      </View>
    </View>
  );
}

function OptionChip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: props.active }} onPress={props.onPress} style={[styles.optionChip, props.active && styles.optionChipActive]}>
      <Text style={[styles.optionChipText, props.active && styles.optionChipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function ExpenseDetailsModal(props: {
  expense: Expense | null;
  busy: boolean;
  categories: string[];
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onChangeCategory: (expense: Expense, category: string) => void;
}) {
  const expense = props.expense;
  return (
    <Modal visible={Boolean(expense)} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.detailScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="Fechar detalhes" />
        {expense ? (
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.detailHeader}>
              <View style={[styles.detailGlyph, { backgroundColor: `${categoryColors[expense.categoriaDespesa] ?? C.muted}20` }]}><Feather name="file-text" size={20} color={categoryColors[expense.categoriaDespesa] ?? C.muted} /></View>
              <Pressable accessibilityLabel="Fechar" style={styles.closeButton} onPress={props.onClose}><Feather name="x" size={19} color={C.ink} /></Pressable>
            </View>
            <Text style={styles.detailCategory}>{expense.categoriaDespesa.toUpperCase()}</Text>
            <Text style={styles.detailName}>{expense.descricaoDespesa}</Text>
            <Text style={styles.detailAmount}>{money(expense.valorDespesa)}</Text>
            <View style={styles.detailFacts}>
              <DetailFact label="DATA" value={displayDate(expense.dataDespesa)} />
              <DetailFact label="PAGAMENTO" value={expense.modalidadePagamento} />
              <DetailFact label="STATUS" value={expense.ativo === 'S' ? 'Ativa' : 'Inativa'} />
            </View>
            <Text style={styles.inputLabel}>ALTERAR CATEGORIA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailCategoryChips}>
              {props.categories.map(category => <OptionChip key={category} label={category} active={expense.categoriaDespesa === category} onPress={() => void props.onChangeCategory(expense, category)} />)}
            </ScrollView>
            <View style={styles.detailActions}>
              <Pressable style={styles.detailEditButton} onPress={() => props.onEdit(expense)}><Feather name="edit-2" size={16} color={C.ink} /><Text style={styles.detailEditText}>Editar</Text></Pressable>
              <Pressable accessibilityLabel="Excluir despesa" style={styles.detailDeleteButton} onPress={() => props.onDelete(expense)}><Feather name="trash-2" size={17} color={C.error} /></Pressable>
            </View>
            {props.busy ? <ActivityIndicator style={styles.detailBusy} size="small" color={C.coral} /> : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function DetailFact(props: { label: string; value: string }) {
  return <View style={styles.detailFact}><Text style={styles.detailFactLabel}>{props.label}</Text><Text numberOfLines={1} style={styles.detailFactValue}>{props.value}</Text></View>;
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: C.paper },
  loadingScreen: { flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  topBar: { minHeight: 92, backgroundColor: C.ink, paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 53, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandEyebrow: { color: '#A9C2B3', fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.8 },
  brandTitle: { color: C.paper, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 25, lineHeight: 29 },
  brandDot: { color: C.coral },
  headerMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#315B50', alignItems: 'center', justifyContent: 'center' },
  contentWrap: { flex: 1 },
  pageContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 },
  headingLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  kicker: { color: C.muted, fontFamily: 'DMSans_500Medium', fontSize: 12, textTransform: 'capitalize', marginBottom: 4 },
  pageTitle: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, lineHeight: 34 },
  avatar: { height: 40, width: 40, backgroundColor: C.gold, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  balancePanel: { backgroundColor: C.ink, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 25, overflow: 'hidden' },
  balanceTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { color: '#B4C9BC', fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 1.5 },
  balanceValue: { color: C.white, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 36, marginTop: 10 },
  balanceCaption: { color: '#B9CBBF', fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  balanceBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  balanceMeter: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#416257', overflow: 'hidden' },
  balanceMeterFill: { height: '100%', borderRadius: 3, backgroundColor: C.gold },
  balanceGoal: { color: '#D7E0D8', fontFamily: 'DMSans_500Medium', fontSize: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginBottom: 12 },
  sectionTitle: { color: C.ink, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18 },
  textLink: { color: C.coral, fontFamily: 'DMSans_700Bold', fontSize: 12 },
  quickActions: { flexDirection: 'row', gap: 11, marginBottom: 25 },
  quickAction: { flex: 1, minHeight: 116, borderRadius: 10, padding: 14, justifyContent: 'flex-end' },
  quickActionPrimary: { backgroundColor: C.coral },
  quickActionPhoto: { backgroundColor: C.mint },
  quickIconPrimary: { position: 'absolute', left: 13, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: '#C7503A', alignItems: 'center', justifyContent: 'center' },
  quickIconPhoto: { position: 'absolute', left: 13, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: C.mintDark, alignItems: 'center', justifyContent: 'center' },
  quickActionTitle: { color: C.ink, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, marginTop: 27 },
  quickActionSub: { color: '#36584F', fontFamily: 'DMSans_400Regular', fontSize: 10, marginTop: 2 },
  tabBar: { flexDirection: 'row', height: Platform.OS === 'ios' ? 94 : 72, paddingBottom: Platform.OS === 'ios' ? 27 : 6, paddingTop: 7, paddingHorizontal: 18, backgroundColor: '#F7FAFE', borderTopWidth: 1, borderTopColor: '#E6EBF1', justifyContent: 'space-evenly' },
  tabButton: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  tabLabel: { color: '#7C8795', fontFamily: 'DMSans_500Medium', fontSize: 10, lineHeight: 13, textAlign: 'center' },
  activeTabLabel: { color: C.coral, fontFamily: 'DMSans_700Bold' },
  accountPanel: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 22, marginBottom: 16, borderRadius: 9, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  accountGlyph: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1, minWidth: 0 },
  accountLabel: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 1.2 },
  accountEmail: { color: C.ink, fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 4 },
  logoutRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 8 },
  logoutGlyph: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.coralLight, alignItems: 'center', justifyContent: 'center' },
  logoutText: { flex: 1, color: C.error, fontFamily: 'DMSans_700Bold', fontSize: 13 },
  expensesPage: { flex: 1, paddingHorizontal: 22, paddingTop: 23 },
  expenseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  addButton: { height: 45, width: 45, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  searchBox: { height: 44, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  searchInput: { flex: 1, color: C.ink, fontFamily: 'DMSans_400Regular', fontSize: 13, height: 42 },
  expenseList: { paddingBottom: 24 },
  expenseRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, gap: 11 },
  expenseGlyph: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  expenseInfo: { flex: 1, minWidth: 0 },
  expenseTitle: { color: C.ink, fontFamily: 'DMSans_700Bold', fontSize: 13 },
  expenseMeta: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 10, marginTop: 4, textTransform: 'capitalize' },
  expenseValueCol: { alignItems: 'flex-end', gap: 4, maxWidth: 116 },
  expenseValue: { color: C.ink, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12 },
  emptyState: { paddingVertical: 30, alignItems: 'center', paddingHorizontal: 20 },
  emptyMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { color: C.ink, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, textAlign: 'center' },
  emptyBody: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, textAlign: 'center', marginTop: 5, maxWidth: 260, lineHeight: 18 },
  inlineError: { backgroundColor: C.coralLight, padding: 12, borderRadius: 8, marginBottom: 10 },
  inlineErrorText: { color: C.error, fontFamily: 'DMSans_500Medium', fontSize: 12 },
  inlineRetry: { color: C.ink, fontFamily: 'DMSans_700Bold', fontSize: 11, marginTop: 8 },
  dashLead: { backgroundColor: C.mint, borderRadius: 10, padding: 18, marginTop: 16, marginBottom: 25, borderLeftWidth: 4, borderLeftColor: C.forest },
  dashLeadLabel: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 1.3 },
  dashLeadValue: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, marginTop: 8 },
  dashLeadFoot: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 3 },
  categoryRow: { marginBottom: 18 },
  categoryRowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  categoryBullet: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  categoryName: { flex: 1, color: C.ink, fontFamily: 'DMSans_500Medium', fontSize: 13 },
  categoryAmount: { color: C.ink, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12 },
  categoryTrack: { height: 8, backgroundColor: '#E4E5DC', borderRadius: 5, overflow: 'hidden' },
  categoryFill: { height: '100%', borderRadius: 5 },
  noteStrip: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: '#E9E7DA', borderRadius: 8, marginTop: 10 },
  noteText: { flex: 1, color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
  loginRoot: { flex: 1, backgroundColor: C.paper },
  loginHero: { height: '40%', minHeight: 270, maxHeight: 345, backgroundColor: C.ink, paddingHorizontal: 28, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 22 : 64, overflow: 'hidden' },
  loginMark: { width: 39, height: 39, borderRadius: 20, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  loginOverline: { color: '#B3C9BC', fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 2 },
  loginBrand: { color: C.white, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 47, lineHeight: 55, marginTop: 5 },
  loginAccentLine: { height: 3, width: 46, backgroundColor: C.coral, marginTop: 9 },
  loginDate: { color: '#B3C9BC', fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 19, textTransform: 'capitalize' },
  loginOrbitOne: { position: 'absolute', right: -76, bottom: -119, width: 246, height: 246, borderRadius: 123, borderWidth: 1, borderColor: '#46665B' },
  loginOrbitTwo: { position: 'absolute', right: -27, bottom: -168, width: 246, height: 246, borderRadius: 123, borderWidth: 1, borderColor: '#46665B' },
  loginBody: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 25 },
  loginHeading: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 25 },
  loginSubheading: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4, marginBottom: 24 },
  inputLabel: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.2, marginBottom: 7, marginTop: 14 },
  loginInputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 7, paddingHorizontal: 12 },
  loginInput: { flex: 1, minWidth: 0, color: C.ink, fontFamily: 'DMSans_400Regular', fontSize: 14, height: 48 },
  loginButton: { height: 50, backgroundColor: C.coral, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, marginTop: 20 },
  loginButtonText: { color: C.white, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  loginFoot: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 10, textAlign: 'center', marginTop: 16 },
  disabledButton: { opacity: 0.65 },
  modalRoot: { flex: 1, backgroundColor: C.paper },
  modalHeader: { minHeight: 85, paddingHorizontal: 19, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 53, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.paper },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  modalTitleWrap: { flex: 1 },
  modalKicker: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 1.3 },
  modalTitle: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, marginTop: 2 },
  formContent: { paddingHorizontal: 21, paddingTop: 18, paddingBottom: 38 },
  formIntro: { color: C.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 8 },
  formField: { marginTop: 1 },
  fieldBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12 },
  fieldPrefix: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 12 },
  fieldInput: { flex: 1, minWidth: 0, color: C.ink, fontFamily: 'DMSans_400Regular', fontSize: 14, minHeight: 44 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 2 },
  optionChip: { paddingHorizontal: 11, minHeight: 31, borderRadius: 16, borderColor: C.line, borderWidth: 1, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  optionChipActive: { backgroundColor: C.ink, borderColor: C.ink },
  optionChipText: { color: C.ink, fontFamily: 'DMSans_500Medium', fontSize: 10 },
  optionChipTextActive: { color: C.white, fontFamily: 'DMSans_700Bold' },
  formError: { color: C.error, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17, marginTop: 12 },
  saveButton: { height: 51, backgroundColor: C.ink, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20 },
  saveButtonText: { color: C.white, fontFamily: 'DMSans_700Bold', fontSize: 13 },
  receiptPreview: { height: 120, marginBottom: 15, borderRadius: 8, overflow: 'hidden', backgroundColor: C.ink },
  receiptImage: { width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.7 },
  receiptOverlay: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptOverlayText: { color: C.white, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  detailScrim: { flex: 1, backgroundColor: 'rgba(12, 30, 26, 0.46)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: C.paper, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 22, paddingTop: 11, paddingBottom: Platform.OS === 'ios' ? 30 : 18 },
  sheetHandle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 3, backgroundColor: '#C8CEC5', marginBottom: 15 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailGlyph: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  detailCategory: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.3, marginTop: 15 },
  detailName: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 23, lineHeight: 29, marginTop: 3 },
  detailAmount: { color: C.ink, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 31, marginTop: 4, marginBottom: 17 },
  detailFacts: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 12, marginBottom: 12, gap: 8 },
  detailFact: { flex: 1, minWidth: 0 },
  detailFactLabel: { color: C.muted, fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 1 },
  detailFactValue: { color: C.ink, fontFamily: 'DMSans_500Medium', fontSize: 10, marginTop: 4 },
  detailCategoryChips: { gap: 7, paddingBottom: 4 },
  detailActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  detailEditButton: { height: 44, flex: 1, borderRadius: 7, backgroundColor: C.mint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailEditText: { color: C.ink, fontFamily: 'DMSans_700Bold', fontSize: 12 },
  detailDeleteButton: { height: 44, width: 48, borderRadius: 7, backgroundColor: C.coralLight, alignItems: 'center', justifyContent: 'center' },
  detailBusy: { position: 'absolute', right: 23, top: 20 },
  cameraScreen: { flex: 1, backgroundColor: '#101A16' },
  cameraHeader: { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 14 : 58, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 },
  cameraClose: { height: 40, width: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  cameraTitleWrap: { alignItems: 'center' },
  cameraTitle: { color: C.white, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16 },
  cameraSub: { color: '#D6DFD8', fontFamily: 'DMSans_400Regular', fontSize: 10, marginTop: 2 },
  cameraSpacer: { width: 40 },
  scanFrame: { position: 'absolute', top: '25%', left: '8%', width: '84%', height: '48%' },
  scanCornerTL: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.gold, borderTopLeftRadius: 8 },
  scanCornerTR: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: C.gold, borderTopRightRadius: 8 },
  scanCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.gold, borderBottomLeftRadius: 8 },
  scanCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.gold, borderBottomRightRadius: 8 },
  cameraBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: Platform.OS === 'ios' ? 52 : 32, paddingTop: 18, alignItems: 'center', backgroundColor: 'rgba(10,18,15,0.6)' },
  cameraHint: { color: '#E4E9E3', fontFamily: 'DMSans_400Regular', fontSize: 11, marginBottom: 17 },
  shutterOuter: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.white },
});