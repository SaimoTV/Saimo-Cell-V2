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
