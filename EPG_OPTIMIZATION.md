# Plano de Otimização EPG

## Problemas Atuais
- XML baixado a cada init (15MB)
- Parse bloqueia UI por 2-5s
- Sem cache persistente eficiente
- Canais registrados a cada fetch

## Soluções

### 1. Cache Persistente com TTL Agressivo
```typescript
// Cache em disco com TTL de 24h (em vez de 12h)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Cache comprimido com gzip se possível
// Background refresh silencioso
```

### 2. Parse Assíncono Otimizado
- Worker thread para parse de XML
- Parse incremental em chunks
- AbortController para cancelar parse

### 3. Channel Index Agressivo
- Index de canais em memória
- Matching ultra-rápido com Map
- Pré-normalização de nomes

### 4. Lazy Loading de Programas
- Carregar apenas canais visíveis na tela (+ buffer)
- Unload de canais fora da viewport
- Paginação de programas

### 5. Matching Fuzzy Melhorado
- Levenshtein distance para matching
- Múltiplos aliases por canal
- Penalidade por caracteres especiais
