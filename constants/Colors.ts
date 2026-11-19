// Constantes de cores e tema do app

export const Colors = {
  // Theme escuro profissional
  background: '#0A0A0F',
  surface: '#15151F',
  surfaceVariant: '#1E1E2D',
  surfaceHover: '#252538',

  // Cores primárias
  primary: '#6366F1',       // Indigo vibrante
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',

  // Cores secundárias
  secondary: '#8B5CF6',     // Purple
  secondaryDark: '#7C3AED',
  secondaryLight: '#A78BFA',

  // Cores de destaque
  accent: '#F43F5E',        // Rosa para favoritos
  accentDark: '#E11D48',

  // Cores de gradiente
  gradientStart: '#6366F1',
  gradientEnd: '#8B5CF6',

  // Texto
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  // Status
  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  error: '#EF4444',
  errorLight: '#F87171',
  info: '#3B82F6',
  infoLight: '#60A5FA',

  // Outros
  border: '#2D2D3D',
  borderLight: '#3F3F5A',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',

  // Live indicator
  live: '#EF4444',
  liveGlow: 'rgba(239, 68, 68, 0.4)',

  // Progress bar
  progressBg: '#374151',
  progressFill: '#6366F1',

  // Cards
  cardBg: '#15151F',
  cardBorder: '#2D2D3D',
  cardHover: '#1E1E2D',
};

// Espaçamentos
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Bordas arredondadas
export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

// Tipografia
export const Typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 14,
  },
};

// Sombras
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

// ───── Aparência escolhida nos Ajustes ─────
//
// Os estilos do app guardam as cores no momento em que cada arquivo é carregado,
// então a escolha precisa estar valendo antes disso: fica num arquivo pequeno
// lido de forma síncrona aqui, na partida. Trocar a cor nos Ajustes grava o
// arquivo e vale na próxima vez que o app abrir.

export const DESTAQUES: Record<string, { nome: string; primary: string; primaryDark: string; primaryLight: string; secondary: string; secondaryDark: string; secondaryLight: string }> = {
  padrao: { nome: 'Índigo', primary: '#6366F1', primaryDark: '#4F46E5', primaryLight: '#818CF8', secondary: '#8B5CF6', secondaryDark: '#7C3AED', secondaryLight: '#A78BFA' },
  pordosol: { nome: 'Pôr do sol', primary: '#F97316', primaryDark: '#EA580C', primaryLight: '#FB923C', secondary: '#EF4444', secondaryDark: '#DC2626', secondaryLight: '#F87171' },
  floresta: { nome: 'Floresta', primary: '#22C55E', primaryDark: '#16A34A', primaryLight: '#4ADE80', secondary: '#14B8A6', secondaryDark: '#0D9488', secondaryLight: '#2DD4BF' },
  rosa: { nome: 'Rosa', primary: '#EC4899', primaryDark: '#DB2777', primaryLight: '#F472B6', secondary: '#D946EF', secondaryDark: '#C026D3', secondaryLight: '#E879F9' },
  safira: { nome: 'Safira', primary: '#3B82F6', primaryDark: '#2563EB', primaryLight: '#60A5FA', secondary: '#06B6D4', secondaryDark: '#0891B2', secondaryLight: '#22D3EE' },
  ouro: { nome: 'Ouro', primary: '#F59E0B', primaryDark: '#D97706', primaryLight: '#FBBF24', secondary: '#F97316', secondaryDark: '#EA580C', secondaryLight: '#FB923C' },
};

export const FUNDOS: Record<string, { nome: string; cores: Partial<typeof Colors> }> = {
  escuro: { nome: 'Escuro', cores: {} },
  amoled: { nome: 'Preto total', cores: { background: '#000000', surface: '#0A0A0A', surfaceVariant: '#121212', surfaceHover: '#1A1A1A', cardBg: '#0A0A0A', cardHover: '#121212', border: '#222222', cardBorder: '#222222' } },
  grafite: { nome: 'Grafite', cores: { background: '#14161C', surface: '#1C1F27', surfaceVariant: '#242831', surfaceHover: '#2B303B', cardBg: '#1C1F27', cardHover: '#242831' } },
};

const ARQUIVO_DO_TEMA = 'saimo-tema.json';

function aplicarPaleta(destaque: string, fundo: string): void {
  const d = DESTAQUES[destaque] ?? DESTAQUES.padrao;
  const f = FUNDOS[fundo] ?? FUNDOS.escuro;
  Object.assign(Colors, {
    primary: d.primary, primaryDark: d.primaryDark, primaryLight: d.primaryLight,
    secondary: d.secondary, secondaryDark: d.secondaryDark, secondaryLight: d.secondaryLight,
    gradientStart: d.primary, gradientEnd: d.secondary, progressFill: d.primary,
    ...f.cores,
  });
}

/** Guarda a escolha para a próxima partida (vale a partir da próxima abertura do app). */
export function gravarTemaParaAProximaPartida(destaque: string, fundo: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system');
    const arquivo = new File(Paths.document, ARQUIVO_DO_TEMA);
    if (!arquivo.exists) arquivo.create();
    arquivo.write(JSON.stringify({ destaque, fundo }));
  } catch { /* sem arquivo: o app abre no padrão */ }
}

(function aplicarTemaSalvo() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system');
    const arquivo = new File(Paths.document, ARQUIVO_DO_TEMA);
    if (!arquivo.exists) return;
    const t = JSON.parse(arquivo.textSync());
    if (t && (t.destaque in DESTAQUES || t.fundo in FUNDOS)) aplicarPaleta(String(t.destaque), String(t.fundo));
  } catch { /* o padrão */ }
})();
