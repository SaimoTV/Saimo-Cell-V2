# SAIMO TV — API Reference

API REST pública via Supabase PostgREST (sem backend). Todos os dados vêm diretamente do banco Supabase.

---

## Configuração

| Campo | Valor |
|---|---|
| **Base URL** | `https://sfumaypqhxzjssarmyrn.supabase.co/rest/v1/rpc` |
| **Projeto** | `sfumaypqhxzjssarmyrn` |
| **Método** | `POST` (todos os endpoints) |
| **Content-Type** | `application/json` |

### Headers obrigatórios

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdW1heXBxaHh6anNzYXJteXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDU1ODUsImV4cCI6MjA4Nzk4MTU4NX0.Ff3DMipcepJuFXuhaXLsievmPG-Czu6FutHZJVxJTO8
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdW1heXBxaHh6anNzYXJteXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDU1ODUsImV4cCI6MjA4Nzk4MTU4NX0.Ff3DMipcepJuFXuhaXLsievmPG-Czu6FutHZJVxJTO8
Content-Type: application/json
```

> A `anon key` é pública por design — permite apenas leitura nas tabelas com política pública (RLS). Não há autenticação de usuário.

### Cliente JS reutilizável

```javascript
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Ff3DMipcepJuFXuhaXLsievmPG-Czu6FutHZJVxJTO8';
const BASE_URL = 'https://sfumaypqhxzjssarmyrn.supabase.co/rest/v1/rpc';

async function rpc(fn, body = {}) {
  const res = await fetch(`${BASE_URL}/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
```

---

## Visão geral dos endpoints

| Endpoint | Uso | Dados retornados |
|---|---|---|
| `get_home` | Tela inicial | Slim — N itens de cada categoria |
| `get_catalog` | Listagem com filtros | Slim — 50 por página |
| `get_filmography` | Filmografia de um ator | Slim — 50 por página |
| `get_item` | Detalhe de um título | **Completo** — cast, sinopse, episódios, URL |
| `get_categories` | Lista de categorias | ID, label e contagem |

> **Slim** = nome, imagens, nota, classificação indicativa, tipo. Sem cast, sinopse, episódios ou URL de stream.
> Use `get_item` para abrir o detalhe de um título.

---

## Endpoints

### 1. `get_home` — Tela inicial

Retorna N itens de **cada categoria** numa única chamada. Ideal para montar a home.

**URL:** `POST /rpc/get_home`

**Parâmetros:**

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `p_type` | `string` | `null` | `"movie"` \| `"series"` \| `null` (ambos) |
| `p_limit` | `integer` | `20` | Itens por categoria (máx: 50) |
| `p_order_by` | `string` | `"rating"` | `"rating"` \| `"new"` \| `"name"` |

**Resposta:** array de categorias, cada uma com seus itens slim.

```json
[
  {
    "id": "acao",
    "label": "Ação",
    "type": "movie",
    "items": [
      {
        "id": "movie-vingadores-the-avengers-2012",
        "name": "Os Vingadores: The Avengers (2012)",
        "type": "movie",
        "category": "acao",
        "categoryLabel": "Ação",
        "isAdult": false,
        "logo": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/POSTER.jpg",
        "tmdb": {
          "id": 24428,
          "title": "Os Vingadores",
          "year": "2012",
          "rating": 7.71,
          "certification": "PG-13",
          "poster":     "https://image.tmdb.org/t/p/w500/POSTER.jpg",
          "posterHD":   "https://image.tmdb.org/t/p/original/POSTER.jpg",
          "backdrop":   "https://image.tmdb.org/t/p/w1280/BACKDROP.jpg",
          "backdropHD": "https://image.tmdb.org/t/p/original/BACKDROP.jpg"
        }
      }
    ]
  },
  {
    "id": "netflix",
    "label": "Netflix",
    "type": "series",
    "items": [ ... ]
  }
]
```

**Exemplos:**
```javascript
// Home completa — filmes + séries, top 20 por rating em cada categoria
const home = await rpc('get_home');

// Só filmes, top 20 mais recentes
const movies = await rpc('get_home', { p_type: 'movie', p_order_by: 'new' });

// Só séries, 10 por categoria
const series = await rpc('get_home', { p_type: 'series', p_limit: 10 });
```

---

### 2. `get_catalog` — Catálogo paginado

Retorna 50 itens por página com filtros opcionais. Dados slim.

**URL:** `POST /rpc/get_catalog`

**Parâmetros:**

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `p_type` | `string` | `null` | `"movie"` \| `"series"` \| `null` (ambos) |
| `p_category` | `string` | `null` | Slug da categoria (ex: `"acao"`, `"netflix"`) |
| `p_page` | `integer` | `1` | Número da página |
| `p_search` | `string` | `null` | Busca parcial por nome |
| `p_actor` | `string` | `null` | Filtra por nome de ator no elenco |
| `p_order_by` | `string` | `"name"` | `"name"` \| `"rating"` \| `"new"` |
| `p_is_adult` | `boolean` | `false` | `true` = inclui conteúdo adulto |

**Resposta:**
```json
{
  "items": [ ... ],
  "total": 3119,
  "page": 1,
  "totalPages": 63
}
```

Cada item segue o **formato slim** (veja seção [Formato dos itens](#formato-dos-itens)).

**Exemplos:**
```javascript
// Filmes de ação, página 1
const result = await rpc('get_catalog', { p_type: 'movie', p_category: 'acao', p_page: 1 });

// Séries Netflix ordenadas por rating
const result = await rpc('get_catalog', { p_type: 'series', p_category: 'netflix', p_order_by: 'rating' });

// Busca por nome
const result = await rpc('get_catalog', { p_search: 'matrix' });

// Busca por nome do ator
const result = await rpc('get_catalog', { p_actor: 'Tom Hanks' });

// Lançamentos recentes
const result = await rpc('get_catalog', { p_order_by: 'new', p_page: 1 });

// Navegar para a próxima página
const p2 = await rpc('get_catalog', { p_type: 'movie', p_category: 'acao', p_page: 2 });
```

---

### 3. `get_item` — Detalhe completo

Retorna um único título com **todos os dados**: sinopse, elenco, episódios, URL de stream.

**URL:** `POST /rpc/get_item`

**Parâmetros:**

| Campo | Tipo | Descrição |
|---|---|---|
| `p_id` | `string` | ID do conteúdo (ex: `"series-dark"`, `"movie-matrix-1999"`) |

**Resposta:** objeto único com todos os campos (veja seção [Formato dos itens](#formato-dos-itens)).

**Exemplo:**
```javascript
// Usuário clicou em um título — busca detalhes completos
const item = await rpc('get_item', { p_id: 'movie-vingadores-the-avengers-2012' });

console.log(item.tmdb.overview);       // sinopse
console.log(item.tmdb.certification); // "PG-13"
console.log(item.tmdb.cast[0]);        // { id: 3223, name: "Robert Downey Jr.", ... }
console.log(item.url);                 // URL de stream

// Série com episódios
const serie = await rpc('get_item', { p_id: 'series-dark' });
console.log(serie.totalSeasons);       // 3
console.log(serie.episodes['1'][0]);   // primeiro episódio da T1
```

---

### 4. `get_filmography` — Filmografia de um ator

Todos os filmes e séries em que um ator participou, do mais recente para o mais antigo. Dados slim.

**URL:** `POST /rpc/get_filmography`

**Parâmetros:**

| Campo | Tipo | Descrição |
|---|---|---|
| `p_actor_id` | `integer` | **ID TMDB do ator** — vem de `get_item` → `cast[].id` — busca exata via índice GIN |
| `p_actor` | `string` | Nome parcial do ator (fallback quando não tem o ID) |
| `p_page` | `integer` | Página (padrão: 1) |

> **Use `p_actor_id`** sempre que possível — é 10× mais rápido que busca por nome.
> Forneça `p_actor_id` **ou** `p_actor`, não os dois.

**Resposta:** mesmo envelope de `get_catalog` (`items`, `total`, `page`, `totalPages`).

**Fluxo típico:**
```javascript
// 1. Usuário abre um título — get_item retorna o cast completo
const item = await rpc('get_item', { p_id: 'movie-vingadores-the-avengers-2012' });

// 2. Usuário clica em um ator — usa o ID inteiro do TMDB
const actor = item.tmdb.cast[0]; // { id: 3223, name: "Robert Downey Jr.", ... }

// 3. Filmografia completa pelo ID do ator
const filmography = await rpc('get_filmography', { p_actor_id: actor.id });

// 4. Paginar
const page2 = await rpc('get_filmography', { p_actor_id: actor.id, p_page: 2 });

// Alternativa: busca por nome (menos preciso)
const alt = await rpc('get_filmography', { p_actor: 'Robert Downey' });
```

**Exemplo curl:**
```bash
# Por ID TMDB do ator
curl -X POST "https://sfumaypqhxzjssarmyrn.supabase.co/rest/v1/rpc/get_filmography" \
  -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_actor_id": 3223}'

# Por nome
curl -X POST ".../rpc/get_filmography" \
  -d '{"p_actor": "Robert Downey", "p_page": 1}'
```

---

### 5. `get_categories` — Categorias disponíveis

Retorna todas as categorias de filmes e séries com ID, label e total de títulos.

**URL:** `POST /rpc/get_categories`
**Body:** `{}`

**Resposta:**
```json
{
  "movies": [
    { "id": "acao",    "label": "Ação",    "count": 3119 },
    { "id": "netflix", "label": "Netflix", "count": 892  },
    { "id": "uhd-4k",  "label": "4K/UHD",  "count": 1171 }
  ],
  "series": [
    { "id": "netflix",  "label": "Netflix",   "count": 1291 },
    { "id": "apple-tv", "label": "Apple TV+", "count": 230  },
    { "id": "animes",   "label": "Animes",    "count": 215  }
  ]
}
```

Use o campo `id` para filtrar em `get_catalog(p_category: "acao")` ou `get_home(p_type: "movie")`.

```javascript
const cats = await rpc('get_categories');
cats.movies.forEach(c => console.log(c.id, c.label, c.count));
```

---

## Formato dos itens

### Slim — `get_home`, `get_catalog`, `get_filmography`

```json
{
  "id": "movie-vingadores-the-avengers-2012",
  "name": "Os Vingadores: The Avengers (2012)",
  "type": "movie",
  "category": "acao",
  "categoryLabel": "Ação",
  "isAdult": false,
  "logo": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/POSTER.jpg",
  "totalSeasons": null,
  "totalEpisodes": null,
  "tmdb": {
    "id": 24428,
    "title": "Os Vingadores",
    "year": "2012",
    "rating": 7.71,
    "certification": "PG-13",
    "poster":     "https://image.tmdb.org/t/p/w500/POSTER.jpg",
    "posterHD":   "https://image.tmdb.org/t/p/original/POSTER.jpg",
    "backdrop":   "https://image.tmdb.org/t/p/w1280/BACKDROP.jpg",
    "backdropHD": "https://image.tmdb.org/t/p/original/BACKDROP.jpg"
  }
}
```

Para séries, `totalSeasons` e `totalEpisodes` vêm preenchidos.

### Completo — `get_item`

Todos os campos slim mais:

```json
{
  "url": "http://servidor.tv/movie/user/pass/12345.mp4",
  "active": true,
  "tmdb": {
    "originalTitle": "The Avengers",
    "overview": "Nick Fury, diretor da agência S.H.I.E.L.D...",
    "releaseDate": "2012-04-25",
    "voteCount": 29834,
    "genres": ["Ação", "Aventura", "Ficção científica"],
    "directors": ["Joss Whedon"],
    "cast": [
      {
        "id": 3223,
        "name": "Robert Downey Jr.",
        "character": "Tony Stark / Iron Man",
        "photo": "https://image.tmdb.org/t/p/w185/PHOTO.jpg"
      }
    ]
  },
  "episodes": {
    "1": [
      { "id": "ep-dark-s01-e001", "episode": 1, "name": "Dark S01 E01", "url": "http://...", "logo": null }
    ]
  }
}
```

`episodes` só existe em séries. Campos `null` são retornados como `null`.

---

## Classificação Indicativa

O campo `tmdb.certification` contém a classificação indicativa real do TMDB:

| País | Filmes | Séries |
|---|---|---|
| 🇧🇷 Brasil (prioridade) | L, 10, 12, 14, 16, 18 | L, 10, 12, 14, 16, 18 |
| 🇺🇸 EUA (fallback) | G, PG, PG-13, R, NC-17 | TV-Y, TV-G, TV-PG, TV-14, TV-MA |

`null` = não disponível no TMDB para este título.

---

## Paginação

`get_catalog` e `get_filmography` retornam envelope paginado:

```json
{
  "items": [...],
  "total": 3119,
  "page": 1,
  "totalPages": 63
}
```

- **50 itens por página**
- `page` começa em 1
- `totalPages = ceil(total / 50)`

```javascript
// Carregar todas as páginas de uma categoria
async function loadAll(category) {
  const first = await rpc('get_catalog', { p_category: category, p_page: 1 });
  const results = [...first.items];
  for (let p = 2; p <= first.totalPages; p++) {
    const page = await rpc('get_catalog', { p_category: category, p_page: p });
    results.push(...page.items);
  }
  return results;
}
```

---

## Categorias disponíveis

Use `get_categories()` para contagens atualizadas. Referência rápida:

### Filmes (`p_type: "movie"`)

| ID | Label |
|---|---|
| `acao` | Ação |
| `aventura` | Aventura |
| `brasileiro` | Brasileiro |
| `cinema` | Cinema |
| `comedia` | Comédia |
| `documentario` | Documentário |
| `drama` | Drama |
| `fantasia` | Fantasia |
| `faroeste` | Faroeste |
| `ficcao-cientifica` | Ficção Científica |
| `guerra` | Guerra |
| `lancamentos` | Lançamentos |
| `legendados` | Legendados |
| `marvel-dc` | Marvel/DC |
| `musicais` | Musicais |
| `netflix` | Netflix |
| `religiosos` | Religiosos |
| `romance` | Romance |
| `shows` | Shows |
| `suspense` | Suspense |
| `terror` | Terror |
| `uhd-4k` | 4K/UHD |
| `discovery` | Discovery+ |
| `hot-adultos` | Adultos |

### Séries (`p_type: "series"`)

| ID | Label |
|---|---|
| `animes` | Animes |
| `apple-tv` | Apple TV+ |
| `brasil-paralelo` | Brasil Paralelo |
| `crunchyroll` | Crunchyroll |
| `desenhos` | Desenhos Animados |
| `directv` | DirecTV Go |
| `discovery` | Discovery+ |
| `disney` | Disney+ |
| `documentario` | Documentário |
| `doramas` | Doramas |
| `globoplay` | Globoplay |
| `hulu` | Hulu |
| `legendadas` | Legendadas |
| `lionsgate` | Lionsgate+ |
| `max` | Max |
| `nacionais` | Nacionais |
| `netflix` | Netflix |
| `novelas` | Novelas |
| `outras-produtoras` | Outras Produtoras |
| `outros` | Outros |
| `paramount` | Paramount+ |
| `prime-video` | Prime Video |
| `reality` | Reality Shows |
| `reelshort` | ReelShort |
| `univer` | Universo |
| `universal-plus` | Universal+ |

---

## Atualizar dados

Para re-gerar o catálogo (ex: nova lista M3U):

```bash
node index.js            # busca M3U + aplica cache TMDB → gera SQL (~30s)
node split-sql.js 4      # divide em partes de 4MB
node upload-supabase.js  # sobe para o Supabase (~20-30min)
```

Para re-enriquecer o cache com IDs de atores e certificações atualizados do TMDB:

```bash
node patch-enrich.js     # re-busca credits + release_dates para todos os itens (~15min)
node index.js && node split-sql.js 4 && node upload-supabase.js
```

---

## Banco de dados

| Tabela | Registros |
|---|---|
| `public.content` (filmes) | 20.004 |
| `public.content` (séries) | 7.163 |
| `public.episodes` | 221.860 |

**Colunas da tabela `content`:**
`id`, `name`, `url`, `active`, `category`, `type`, `is_adult`, `logo`, `total_seasons`, `total_episodes`, `tmdb_id`, `tmdb_title`, `tmdb_original_title`, `tmdb_overview`, `tmdb_poster_path`, `tmdb_backdrop_path`, `tmdb_release_date`, `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_genres`, `tmdb_director`, `tmdb_cast`, `tmdb_media_type`, `tmdb_certification`
